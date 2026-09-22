import { Context } from "hono";
import { JobType } from "./queueConsumer";
import { PrismaClient } from "@prisma/client";
import { sendPaymentAgreementCompletedEmail } from "@/services/emailService";

// Webhook Body: {"customer_no": {@customer_no@}}

// The PV survey that combines the payment form + agreement/terms signing
// (control.peoplevine.com/admin_survey_menu.aspx?survey_no=20611). Configurable since
// PV webhook bodies are hand-templated per event in the PV Control Panel — if the
// template's field name/value ever changes there, override via env instead of a code
// change. Detection also falls back to matching on eventType so this keeps working even
// if the configured template doesn't include a survey id at all.
const ONBOARDING_PAYMENT_SURVEY_ID = "20611";

const isOnboardingPaymentAgreementEvent = (
  payload: Record<string, unknown>,
  eventType: string,
  expectedSurveyId: string
): boolean => {
  const surveyId =
    payload.survey_id != null ? String(payload.survey_id)
    : payload.survey_no != null ? String(payload.survey_no)
    : payload.SurveyId != null ? String(payload.SurveyId)
    : null;
  if (surveyId && surveyId === expectedSurveyId) return true;
  return /survey|payment.*agreement|agreement.*payment/i.test(eventType);
};

export const handlePeopleVineWebhook = async (c: Context) => {
  const expectedSecret = c.env.WEBHOOK_SECRET as string | undefined;
  if (expectedSecret) {
    const provided = c.req.query('secret') || c.req.header('x-webhook-secret');
    if (provided !== expectedSecret) {
      return c.json({ message: 'Unauthorized' }, 401);
    }
  }

  const rawBody = await c.req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ message: "Invalid JSON" }, 400);
  }

  const prisma = c.get("db") as PrismaClient;
  const logId = crypto.randomUUID();
  const eventType = typeof payload.event_type === 'string' ? payload.event_type
    : typeof payload.type === 'string' ? payload.type
    : 'customer_update';

  const peopleVineId = Number(payload.customer_no);
  if (!Number.isInteger(peopleVineId) || peopleVineId <= 0) {
    console.warn("Received invalid customer_no in PeopleVine webhook:", payload.customer_no);
    c.executionCtx.waitUntil(
      prisma.webhookLog.create({
        data: { id: logId, customerNo: null, eventType, payload: rawBody, status: "invalid" },
      })
    );
    return c.json({ message: "Invalid payload" }, 400);
  }

  // For membership_changed: check if the membership type is in CMT
  let webhookStatus = "queued";
  let invalidMembership: string | null = null;
  if (eventType === 'membership_changed') {
    const membershipType = (
      typeof payload.membership_type === 'string' ? payload.membership_type :
      typeof payload.title === 'string' ? payload.title :
      typeof payload.subscription_title === 'string' ? payload.subscription_title :
      typeof payload.plan_name === 'string' ? payload.plan_name :
      null
    )?.trim() ?? null;

    if (membershipType) {
      const validCmt = await prisma.companyMembershipType.findFirst({ where: { name: membershipType } }).catch(() => null);
      if (!validCmt) {
        console.warn(`[webhook] membership_changed for customer ${peopleVineId} — type "${membershipType}" is not in CMT. Will sync to deactivate.`);
        webhookStatus = "invalid_membership";
        invalidMembership = membershipType;
      }
    }
  }

  c.executionCtx.waitUntil(
    prisma.webhookLog.create({
      data: { id: logId, customerNo: peopleVineId, eventType, payload: rawBody, status: webhookStatus },
    })
  );

  // Onboarding "Payment & Agreement Completed" step: stamped directly here (not via the
  // SYNC_PEOPLEVINE_CUSTOMER job below, which only refreshes membership/profile fields and
  // knows nothing about onboarding progress). Set-once — a retried/duplicate PV webhook
  // delivery for the same event is a no-op instead of re-stamping the timestamp.
  const expectedSurveyId = (c.env.PEOPLEVINE_ONBOARDING_SURVEY_ID as string | undefined) ?? ONBOARDING_PAYMENT_SURVEY_ID;
  if (isOnboardingPaymentAgreementEvent(payload, eventType, expectedSurveyId)) {
    c.executionCtx.waitUntil(
      (async () => {
        const pvId = String(peopleVineId);
        const [directCompany, matchedUser] = await Promise.all([
          prisma.company.findUnique({ where: { peopleVineId: pvId } }),
          prisma.user.findUnique({ where: { peopleVineId: pvId } }),
        ]);

        // Best-effort — a failed confirmation email must never undo or fail the
        // onboarding stamp that already succeeded, same convention as
        // sendOnboardingPaymentFormEmail (onboardingController.ts).
        const notifyPaymentAgreementCompleted = (to: string, to_name: string) =>
          sendPaymentAgreementCompletedEmail(c, { to, to_name }).catch((e) =>
            console.error("[webhook] Failed to send payment-agreement-completed email:", e)
          );

        const stampCompanyById = async (companyId: string): Promise<boolean> => {
          const co = await prisma.company.findUnique({ where: { id: companyId } });
          if (co && !co.onboardingPaymentAgreementAt) {
            await prisma.company.update({
              where: { id: co.id },
              data: { onboardingPaymentAgreementAt: new Date() },
            });
            return true;
          }
          return false;
        };

        // Direct hit: customer_no matches a Company's own PV id. This is now the common
        // case for onboarding, not just legacy/bulk-synced accounts — a pending_membership
        // User logs into PV's member portal AS their parent Company (see
        // samlController.ts's resolveSamlIdentityEmail), so this survey submission could be
        // on behalf of any of that company's still-pending members. Stamp the company
        // itself, then cascade to every pending_membership User under it that isn't
        // stamped yet (there's no way to tell which one actually submitted, since they all
        // share the same PV login identity while pending).
        if (directCompany) {
          const companyNewlyStamped = await stampCompanyById(directCompany.id);
          const pendingCompanyUsers = await prisma.user.findMany({
            where: { companyId: directCompany.id, accountStatus: "pending_membership", onboardingPaymentAgreementAt: null },
          });
          await Promise.all(
            pendingCompanyUsers.map((u) =>
              prisma.user.update({ where: { id: u.id }, data: { onboardingPaymentAgreementAt: new Date() } })
            )
          );
          await Promise.all(pendingCompanyUsers.map((u) => notifyPaymentAgreementCompleted(u.email, u.name)));
          // No individual pending members to notify (e.g. a solo company account) — fall
          // back to notifying the company's own contact email instead of sending nothing.
          if (companyNewlyStamped && pendingCompanyUsers.length === 0) {
            await notifyPaymentAgreementCompleted(directCompany.email, directCompany.name);
          }
        }

        if (matchedUser) {
          let userNewlyStamped = false;
          if (!matchedUser.onboardingPaymentAgreementAt) {
            await prisma.user.update({
              where: { id: matchedUser.id },
              data: { onboardingPaymentAgreementAt: new Date() },
            });
            userNewlyStamped = true;
          }
          // The onboarding push flow (pushOnboardingSubmissionToPeopleVine) registers the
          // company and the person as two SEPARATE PV customers with different PV ids —
          // there's no PV-side relational link between them. `User.companyId` (our own FK,
          // set at creation) is the only reliable way to also mark the person's company
          // complete from the same "I paid & signed" event.
          await stampCompanyById(matchedUser.companyId);
          if (userNewlyStamped) {
            await notifyPaymentAgreementCompleted(matchedUser.email, matchedUser.name);
          }
        }
      })().catch((e) => console.error("[webhook] Failed to stamp onboardingPaymentAgreementAt:", e))
    );
  }

  console.log("Received PeopleVine webhook for customer:", peopleVineId);
  await c.env.QUEUE.send({
    jobId: `${crypto.randomUUID()}-${Date.now()}`,
    jobType: JobType.SYNC_PEOPLEVINE_CUSTOMER,
    payload: { peopleVineId, webhookLogId: logId, invalidMembership },
  });
  return c.json({ message: "PeopleVine webhook received" }, 200);
}
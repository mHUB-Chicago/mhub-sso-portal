import { useState } from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiNote } from "./ApiNote";
import { RichTextEditor } from "./RichTextEditor";
import { useSendOnboardingLinkEmailMutation } from "@/store/api/onboardingApi";

interface LinkGeneratedStepProps {
  url: string;
  token: string;
  onCreateAnother: () => void;
}

const defaultEmailBody = (url: string) =>
  `<p>Hi there,</p><p>You've been invited to join mHUB. Please use the link below to get started:</p><p><a href="${url}">${url}</a></p><p>See you soon!</p>`;

export const LinkGeneratedStep = ({ url, token, onCreateAnother }: LinkGeneratedStepProps) => {
  const [copied, setCopied] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [to, setTo] = useState("");
  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("You're invited to join mHUB");
  const [html, setHtml] = useState(defaultEmailBody(url));
  const [sent, setSent] = useState(false);

  const [sendOnboardingLinkEmail, { isLoading: isSending }] = useSendOnboardingLinkEmailMutation();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error("Enter a recipient email first.");
      return;
    }
    try {
      await sendOnboardingLinkEmail({
        token,
        to: to.trim(),
        toName: toName.trim() || undefined,
        subject,
        html,
      }).unwrap();
      toast.success(`Email sent to ${to.trim()}.`);
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Shareable Link Ready</h2>
        <p className="text-gray-600">Send this link to the prospect so they can complete the form themselves.</p>
      </div>

      <div className="flex gap-2">
        <Input value={url} readOnly className="font-mono text-sm" />
        <Button type="button" onClick={handleCopy} variant="outline">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <ApiNote variant="info">
        The link expires after one submission. The company and member profiles land in the review
        queue once they finish the form — nothing is pushed to PeopleVine until an admin approves it.
      </ApiNote>

      {!showCompose ? (
        <Button type="button" variant="outline" onClick={() => setShowCompose(true)}>
          <Mail className="mr-2 h-4 w-4" />
          Send via email instead
        </Button>
      ) : (
        <div className="space-y-4 rounded-lg border p-5">
          <h3 className="text-sm font-semibold text-gray-900">Compose email</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sendTo">
                To <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sendTo"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="prospect@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="sendToName">Recipient Name</Label>
              <Input id="sendToName" value={toName} onChange={(e) => setToName(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="sendSubject">Subject</Label>
            <Input id="sendSubject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
          </div>
          <RichTextEditor id="sendBody" label="Message" content={html} onChange={setHtml} />

          <Button type="button" onClick={handleSend} disabled={isSending} className="bg-brand hover:bg-brand-hover">
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {sent ? "Send again" : "Send Email"}
          </Button>
        </div>
      )}

      <Button variant="outline" onClick={onCreateAnother}>
        Generate another link
      </Button>
    </div>
  );
};

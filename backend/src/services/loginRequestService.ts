import { LoginRequest, PrismaClient, User } from "@/database/models";
import { Context } from "hono";
import { getUserByEmail, updateUser } from "./userService";
import { hashPassword, verifyPassword } from "@/utils/jwt";
import { sendOneTimePasswordEmail } from "./emailService";

const LOGIN_REQUEST_EXPIRE_TIME_MS = 15 * 60 * 1000; // 15 minutes

export interface CreateLoginRequestInput {
  email: string;
}

export interface VerifyLoginRequestInput {
  requestId: string;
  password: string;
}

const generateOneTimePassword = (): string => {
  // Generates an 8 character, alphanumeric one-time password as a string
  const passwordLength = 8;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let otp = '';
  for (let i = 0; i < passwordLength; i++) {
    const randomIndex = Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / (0xFFFFFFFF + 1) * chars.length);
    otp += chars.charAt(randomIndex);
  }
  return otp;
}

const incrementLoginAttempts = async (c: Context, id: string): Promise<LoginRequest> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.loginRequest.update({
    where: { id },
    data: {
      attemptsCount: {
        increment: 1
      }
    },
  });
}

export const getActiveLoginRequestByUserId = (c: Context, userId: string): Promise<LoginRequest | null> => {
  const prisma: PrismaClient = c.get("db");
  const now = new Date();
  return prisma.loginRequest.findFirst({
    where: {
      userId,
      expiresAt: {
        gt: now,
      },
      otpVerifiedAt: null,
      passwordVerifiedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export const getLoginRequestById = (c: Context, id: string): Promise<LoginRequest & { user: User } | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.loginRequest.findUnique({
    where: { id },
    include: { user: true },
  });
}

export const createLoginRequest = async (c: Context, createLoginRequestInput: CreateLoginRequestInput): Promise<LoginRequest> => {
  const prisma: PrismaClient = c.get("db");
  const { email } = createLoginRequestInput;
  const user = await getUserByEmail(c, email);
  if (!user) {
    throw new Error("User not found");
  }
  const activeLoginRequest = await getActiveLoginRequestByUserId(c, user.id);
  if (activeLoginRequest) {
    return activeLoginRequest;
  }
  let loginRequest = await prisma.loginRequest.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + LOGIN_REQUEST_EXPIRE_TIME_MS),
    },
  });

  // If no password is set, user email is not verified, or user must reset password, generate and send OTP
  if (user.passwordHashed === null || !user.emailVerified || user.mustResetPassword) {
    const oneTimePassword = generateOneTimePassword();
    const otpHashed = await hashPassword(oneTimePassword);
    loginRequest = await prisma.loginRequest.update({
      where: { id: loginRequest.id },
      data: { otpHashed },
    });
    await sendOneTimePasswordEmail(c, {
      to: user.email,
      to_name: user.name,
      password: oneTimePassword,
    });
  }
  return loginRequest;
};

const MAX_LOGIN_ATTEMPTS = 5;

export const verifyLoginRequest = async (c: Context, verifyLoginRequestInput: VerifyLoginRequestInput): Promise<LoginRequest> => {
  const prisma: PrismaClient = c.get("db");
  const { requestId, password } = verifyLoginRequestInput;
  const loginRequest = await getLoginRequestById(c, requestId);
  if (!loginRequest) {
    // Can't increment attempts if login request doesn't exist
    throw new Error("Invalid request ID");
  }
  if (loginRequest.expiresAt < new Date()) {
    throw new Error("Login request has expired");
  }
  if (loginRequest.otpVerifiedAt || loginRequest.passwordVerifiedAt) {
    throw new Error("Login request already verified");
  }
  if (loginRequest.attemptsCount >= MAX_LOGIN_ATTEMPTS) {
    throw new Error("Too many attempts. Please request a new login.");
  }
  const user = loginRequest.user;
  const otpValid = !!loginRequest.otpHashed && await verifyPassword(password, loginRequest.otpHashed);
  const passwordValid = !loginRequest.otpHashed && !!user.passwordHashed && await verifyPassword(password, user.passwordHashed);

  if (otpValid) {
    // If OTP was used, mark it as verified
    await prisma.loginRequest.update({
      where: { id: loginRequest.id },
      data: { otpVerifiedAt: new Date() },
    });
    // Also mark user email as verified since OTP was sent to their email
    await updateUser(c, { id: user.id, emailVerified: true });
  } else if (passwordValid) {
    // If password is used, mark it as verified
    await prisma.loginRequest.update({
      where: { id: loginRequest.id },
      data: { passwordVerifiedAt: new Date() },
    });
  } else {
    // Invalid password
    await incrementLoginAttempts(c, loginRequest.id);
    throw new Error("Invalid password");
  }

  // Update attempts count
  let updatedLoginRequest = await incrementLoginAttempts(c, loginRequest.id);

  return updatedLoginRequest;
};

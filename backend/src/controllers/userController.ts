import { Context } from "hono/jsx";
import { AppType, JsonInput } from "..";
import { LoginUserRequestSchema } from "@common/schemas/user";
import { getUserByEmail } from "@/services/userService";
import { hashPassword } from "@/utils/jwt";
import { createSession } from "@/services/sessionService";
import { setCookie } from "hono/cookie";

export const handleLoginUser = async (c: Context<AppType, string, JsonInput<typeof LoginUserRequestSchema>>) => {
  try {
    const { email, password } = c.req.valid("json");
    const user = await getUserByEmail(c, email);
    if (!user) {
      throw new Error("User not found");
    }
    const hashedPassword = await hashPassword(password);
    if (user.password !== hashedPassword) {
      throw new Error("Invalid password");
    }
    const sessionId = await createSession(c, user.id);
    setCookie(c, "sid", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    return c.json({ message: "Login successful" });
  } catch (error) {
    console.log(error);
    return c.json({ message: "Invalid email or password" }, 401);
  }
}
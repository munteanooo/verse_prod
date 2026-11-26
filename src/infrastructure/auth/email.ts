import nodemailer from "nodemailer";
import { identityMessages } from "../../i18n/identity-ro";

export type IdentityEmail = {
  recipient: string;
  kind: "verification" | "password-reset";
  url: string;
};

export type SendIdentityEmail = (message: IdentityEmail) => Promise<void>;

export function smtpEmail(url: string, from: string): SendIdentityEmail {
  const endpoint = new URL(url);
  const secure = endpoint.protocol === "smtps:";
  const smtp = nodemailer.createTransport({
    host: endpoint.hostname,
    port: Number(endpoint.port || (secure ? 465 : 25)),
    secure,
    auth: endpoint.username
      ? {
          user: decodeURIComponent(endpoint.username),
          pass: decodeURIComponent(endpoint.password),
        }
      : undefined,
    tls: { rejectUnauthorized: true },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  return async ({ recipient, kind, url: link }) => {
    const subject =
      kind === "verification"
        ? identityMessages.verificationSubject
        : identityMessages.resetSubject;
    await smtp.sendMail({
      from,
      to: recipient,
      subject,
      text: subject + "\n\n" + link,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  };
}

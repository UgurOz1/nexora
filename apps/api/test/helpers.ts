import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService, type MailMessage } from '../src/mail/mail.service';

export const PASSWORD = 'correct horse battery';

export interface TestUser {
  name: string;
  email: string;
  id: string;
  token: string;
}

export interface TestContext {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  mails: MailMessage[];
  // Signs up a user; by default also confirms their email through the real emailed link.
  signUp: (name: string, options?: { verified?: boolean }) => Promise<TestUser>;
  // The token inside the newest email to `email` whose subject contains `subjectPart`.
  mailToken: (email: string, subjectPart: string) => string;
}

export async function createTestApp(): Promise<TestContext> {
  const mails: MailMessage[] = [];
  // Emails are captured instead of sent, so tests can follow the links like a user would.
  const fakeMail = { send: (message: MailMessage) => Promise.resolve(void mails.push(message)) };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(fakeMail)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  const run = Date.now().toString(36);

  const mailToken = (email: string, subjectPart: string): string => {
    const mail = [...mails]
      .reverse()
      .find((m) => m.to === email && m.subject.includes(subjectPart));
    if (!mail) {
      throw new Error(`No "${subjectPart}" email sent to ${email}`);
    }
    const link = /https?:\/\/\S+/.exec(mail.text)?.[0] ?? '';
    return new URL(link).searchParams.get('token') ?? '';
  };

  const signUp = async (name: string, options: { verified?: boolean } = {}) => {
    const email = `${name}.${run}@example.com`;
    const registered = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, name })
      .expect(201);
    const token = (registered.body as { accessToken: string }).accessToken;

    if (options.verified !== false) {
      await http()
        .post('/api/v1/auth/verify-email')
        .send({ token: mailToken(email, 'Confirm') })
        .expect(204);
    }
    const me = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { name, email, token, id: (me.body as { id: string }).id };
  };

  return { app, http, mails, signUp, mailToken };
}

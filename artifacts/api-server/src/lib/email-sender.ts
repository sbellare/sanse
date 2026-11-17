export type EmailOptions = {
  method: "POST";
  headers: Record<string, string>;
  body: string;
};

export type EmailSender = (options: EmailOptions) => Promise<Response>;

export function isEmailConfigured(environment = process.env): boolean {
  return environment.VERCEL !== "1" || Boolean(environment.RESEND_API_KEY?.trim());
}

type TransportOptions = {
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  connectorSend?: EmailSender;
};

// Construct the Replit client only when that transport is actually needed.
// Vercel must use its own server-side Resend key, never a Replit credential.
let replitSender: EmailSender | undefined;
async function sendWithReplit(options: EmailOptions): Promise<Response> {
  if (!replitSender) {
    const { ReplitConnectors } = await import("@replit/connectors-sdk");
    const connectors = new ReplitConnectors();
    replitSender = (request) => connectors.proxy("resend", "/emails", request);
  }
  return replitSender(options);
}

export function createEmailSender({
  environment = process.env,
  fetch: fetchEmail = globalThis.fetch,
  connectorSend = sendWithReplit,
}: TransportOptions = {}): EmailSender {
  return async (options) => {
    const apiKey = environment.RESEND_API_KEY?.trim();
    if (apiKey) {
      return fetchEmail("https://api.resend.com/emails", {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    }
    if (environment.VERCEL === "1") {
      throw new Error("RESEND_API_KEY must be configured in Vercel.");
    }
    return connectorSend(options);
  };
}

export const sendEmail = createEmailSender();

import { createHmac, timingSafeEqual } from 'node:crypto';

const apiBaseUrl = process.env.JCA_API_BASE_URL ?? 'http://localhost:3001';
const apiKey = process.env.JCA_API_KEY ?? 'jca_xxxx';

async function auditJob() {
  const response = await fetch(`${apiBaseUrl}/v1/audit/job`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      externalId: 'job_001',
      company: { name: '某某科技有限公司' },
      job: {
        title: '行政专员',
        description: '负责办公室行政工作，薪资8k-12k。',
        location: '北京',
      },
      options: {
        jurisdiction: 'CN_MAINLAND',
        enableRag: true,
      },
      sandbox: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Audit failed: ${response.status} ${await response.text()}`);
  }
  return await response.json();
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}): boolean {
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest('hex');
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(input.signature, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

void auditJob().then((result) => {
  console.log(result);
});

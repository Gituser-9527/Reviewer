import { describe, expect, it } from 'vitest';
import {
  detectSensitiveInfo,
  hashSensitiveValue,
  redactSensitiveInfo,
  sanitizeAuditLog,
  sanitizeLLMMessages,
} from './sensitive-info.js';

const sensitiveText =
  '联系人手机13812345678，身份证110101199001011234，邮箱test@example.com，银行卡6222020202020202020，微信号 wx_test123，地址北京市朝阳区幸福路88号1单元，验证码 123456。';

describe('security sensitive info module', () => {
  it('detects supported sensitive information categories', () => {
    const types = detectSensitiveInfo(sensitiveText).map((match) => match.type);

    expect(types).toEqual(
      expect.arrayContaining([
        'PHONE',
        'ID_CARD',
        'EMAIL',
        'BANK_CARD',
        'WECHAT_ID',
        'ADDRESS',
        'VERIFICATION_CODE',
      ]),
    );
  });

  it('redacts phone, ID card and email using masked forms', () => {
    const redacted = redactSensitiveInfo(
      '手机13812345678，身份证110101199001011234，邮箱test@example.com',
    );

    expect(redacted).toContain('138****5678');
    expect(redacted).toContain('110101********1234');
    expect(redacted).toContain('t***@example.com');
    expect(redacted).not.toContain('13812345678');
    expect(redacted).not.toContain('110101199001011234');
    expect(redacted).not.toContain('test@example.com');
  });

  it('redacts bank card, WeChat id, address and verification code', () => {
    const redacted = redactSensitiveInfo(
      '银行卡6222020202020202020，微信号 wx_test123，地址北京市朝阳区幸福路88号1单元，验证码 123456',
    );

    expect(redacted).toContain('6222***********2020');
    expect(redacted).toContain('wx******23');
    expect(redacted).toContain('北京市朝***');
    expect(redacted).toContain('验证码 ******');
    expect(redacted).not.toContain('6222020202020202020');
    expect(redacted).not.toContain('wx_test123');
    expect(redacted).not.toContain('北京市朝阳区幸福路88号1单元');
    expect(redacted).not.toContain('123456');
  });

  it('hashes sensitive values deterministically', () => {
    const left = hashSensitiveValue({ phone: '13812345678', name: 'candidate' });
    const right = hashSensitiveValue({ name: 'candidate', phone: '13812345678' });

    expect(left).toBe(right);
    expect(left).toHaveLength(64);
  });

  it('sanitizes audit logs and omits rawText by default', () => {
    const sanitized = sanitizeAuditLog({
      rawText: '手机号13812345678，身份证110101199001011234',
      nested: {
        comment: '联系邮箱test@example.com',
      },
    });

    expect(sanitized.rawText).toBe('[RAW_TEXT_OMITTED]');
    expect(sanitized.nested.comment).toBe('联系邮箱t***@example.com');
    expect(JSON.stringify(sanitized)).not.toContain('13812345678');
    expect(JSON.stringify(sanitized)).not.toContain('110101199001011234');
    expect(JSON.stringify(sanitized)).not.toContain('test@example.com');
  });

  it('can include rawText only in redacted form unless explicitly allowed', () => {
    const sanitized = sanitizeAuditLog(
      {
        rawText: '手机号13812345678，身份证110101199001011234',
      },
      { includeRawText: true },
    );

    expect(sanitized.rawText).toContain('138****5678');
    expect(sanitized.rawText).toContain('110101********1234');
    expect(sanitized.rawText).not.toContain('13812345678');
  });

  it('redacts LLM messages by default', () => {
    const [message] = sanitizeLLMMessages([
      {
        role: 'user',
        content: '候选人手机13812345678，身份证110101199001011234',
      },
    ]);

    expect(message?.content).toContain('138****5678');
    expect(message?.content).not.toContain('13812345678');
    expect(message?.content).not.toContain('110101199001011234');
  });

  it('allows unredacted LLM messages only when explicitly requested', () => {
    const [message] = sanitizeLLMMessages(
      [
        {
          role: 'user',
          content: '候选人手机13812345678',
        },
      ],
      true,
    );

    expect(message?.content).toContain('13812345678');
  });
});

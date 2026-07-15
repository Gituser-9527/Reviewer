import { getRequestConfig } from 'next-intl/server';
import zhMessages from '../messages/zh-CN.json';
import enMessages from '../messages/en-US.json';

const messagesByLocale = {
  'zh-CN': zhMessages,
  'en-US': enMessages,
} as const;

export default getRequestConfig(async () => ({
  locale: 'zh-CN',
  messages: messagesByLocale['zh-CN'],
}));

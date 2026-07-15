'use client';

import { useEffect, useMemo } from 'react';
import { getMessages, useLanguage } from '../i18n/language-provider';

const skippedTags = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);

function enumMap(locale: string): Record<string, string> {
  const zh = getMessages('zh-CN').enums;
  const en = getMessages('en-US').enums;
  const map: Record<string, string> = {};
  for (const group of Object.keys(en) as Array<keyof typeof en>) {
    for (const key of Object.keys(en[group]) as Array<keyof (typeof en)[typeof group]>) {
      const raw = String(key);
      const zhLabel = String(zh[group][key as never]);
      const enLabel = String(en[group][key as never]);
      if (locale === 'en-US') {
        map[raw] = enLabel;
        map[zhLabel] = enLabel;
      } else {
        map[raw] = zhLabel;
        map[enLabel] = zhLabel;
      }
    }
  }
  return map;
}

function textMap(locale: string) {
  const enLegacy = getMessages('en-US').legacy as Record<string, string>;
  const base =
    locale === 'en-US'
      ? enLegacy
      : Object.fromEntries(Object.entries(enLegacy).map(([source, target]) => [target, source]));
  return {
    ...base,
    ...enumMap(locale),
  };
}

function replaceAll(value: string, map: Record<string, string>): string {
  let next = value;
  const entries = Object.entries(map).sort((left, right) => right[0].length - left[0].length);
  for (const [source, target] of entries) {
    if (source !== target && next.includes(source)) {
      next = next.split(source).join(target);
    }
  }
  return next;
}

function localizeNode(root: ParentNode, map: Record<string, string>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current !== null) {
    const parent = current.parentElement;
    if (parent !== null && !skippedTags.has(parent.tagName)) {
      textNodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  for (const node of textNodes) {
    const replaced = replaceAll(node.data, map);
    if (replaced !== node.data) node.data = replaced;
  }

  for (const element of root.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]')) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attr);
      if (value !== null) {
        const replaced = replaceAll(value, map);
        if (replaced !== value) element.setAttribute(attr, replaced);
      }
    }
  }
}

export function LegacyLocalizer() {
  const { locale } = useLanguage();
  const map = useMemo(() => textMap(locale), [locale]);

  useEffect(() => {
    localizeNode(document.body, map);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const text = mutation.target as Text;
          const parent = text.parentElement;
          if (parent !== null && !skippedTags.has(parent.tagName)) {
            const replaced = replaceAll(text.data, map);
            if (replaced !== text.data) text.data = replaced;
          }
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            localizeNode(node as HTMLElement, map);
          }
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node as Text;
            const replaced = replaceAll(text.data, map);
            if (replaced !== text.data) text.data = replaced;
          }
        }
      }
    });
    observer.observe(document.body, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [map]);

  return null;
}

import * as runtime from 'react/jsx-dev-runtime';
import { localizeJsxProps } from './index.ts';
import { LocalizedText } from './LocalizedText.ts';

export const Fragment = runtime.Fragment;
const textElement = (source: string, sourceInfo: any, self: any) => runtime.jsxDEV(LocalizedText, { source }, undefined, false, sourceInfo, self);
export const jsxDEV = (type: any, props: any, key: any, isStaticChildren: boolean, source: any, self: any) =>
  runtime.jsxDEV(type, localizeJsxProps(props, type, (text) => textElement(text, source, self)), key, isStaticChildren, source, self);
export type { JSX } from 'react';

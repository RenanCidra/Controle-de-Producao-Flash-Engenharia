import * as runtime from 'react/jsx-runtime';
import { localizeJsxProps } from './index.ts';
import { LocalizedText } from './LocalizedText.ts';

export const Fragment = runtime.Fragment;
const textElement = (source: string) => runtime.jsx(LocalizedText, { source });
export const jsx = (type: any, props: any, key?: any) => runtime.jsx(type, localizeJsxProps(props, type, textElement), key);
export const jsxs = (type: any, props: any, key?: any) => runtime.jsxs(type, localizeJsxProps(props, type, textElement), key);
export type { JSX } from 'react';

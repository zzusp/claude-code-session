import path from 'node:path';

const WIN_DRIVE_DOUBLE_DASH = /^([A-Za-z])--/;

export function decodeCwd(encoded: string): string {
  if (WIN_DRIVE_DOUBLE_DASH.test(encoded)) {
    const drive = encoded[0]!.toUpperCase();
    const rest = encoded.slice(3).replace(/-/g, '\\');
    return `${drive}:\\${rest}`;
  }
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded;
}

export function encodeCwd(cwd: string): string {
  if (path.isAbsolute(cwd) && /^[A-Za-z]:[\\/]/.test(cwd)) {
    const drive = cwd[0]!.toUpperCase();
    const rest = cwd.slice(3).replace(/[\\/]/g, '-');
    return `${drive}--${rest}`;
  }
  return cwd.replace(/\//g, '-');
}

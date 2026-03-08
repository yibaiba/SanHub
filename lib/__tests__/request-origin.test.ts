import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestOrigin } from '../request-origin';

describe('request origin helper', () => {
  it('prefers origin header over internal nextUrl origin', () => {
    const request = new NextRequest('http://0.0.0.0:3000/api/user/history', {
      headers: {
        host: '0.0.0.0:3000',
        origin: 'http://localhost:3000',
      },
    });

    expect(getRequestOrigin(request)).toBe('http://localhost:3000');
  });

  it('falls back to referer origin when origin header is missing', () => {
    const request = new NextRequest('http://0.0.0.0:3000/api/user/history', {
      headers: {
        host: '0.0.0.0:3000',
        referer: 'http://localhost:3000/image',
      },
    });

    expect(getRequestOrigin(request)).toBe('http://localhost:3000');
  });

  it('prefers forwarded host and proto over nextUrl origin', () => {
    const request = new NextRequest('http://0.0.0.0:3000/api/user/history', {
      headers: {
        host: '0.0.0.0:3000',
        'x-forwarded-host': 'localhost:3000',
        'x-forwarded-proto': 'http',
      },
    });

    expect(getRequestOrigin(request)).toBe('http://localhost:3000');
  });

  it('falls back to host header when forwarded host is missing', () => {
    const request = new NextRequest('http://0.0.0.0:3000/api/user/history', {
      headers: {
        host: 'localhost:3000',
      },
    });

    expect(getRequestOrigin(request)).toBe('http://localhost:3000');
  });
});

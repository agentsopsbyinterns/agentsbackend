import { google } from 'googleapis';
import { env } from '../../config/env';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../prisma/client';

type StoredTokens = {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  email?: string;
};

function getOAuthClient() {
  const clientId = env.GOOGLE_CLIENT_ID as string;
  const clientSecret = env.GOOGLE_CLIENT_SECRET as string;
  const redirectUri = (env.GOOGLE_CALENDAR_CALLBACK as string) || `${env.APP_URL}/integrations/google-calendar/callback`;
  const oauth2Client = new (google as any).auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2Client;
}

function tokensDir() {
  return path.resolve(process.cwd(), 'src', 'data', 'google-calendar');
}

function tokenPathForOrg(orgId: string) {
  return path.join(tokensDir(), `${orgId}.json`);
}

async function ensureDirExists(p: string) {
  try {
    await fs.mkdir(p, { recursive: true });
  } catch {}
}

export async function getAuthUrl(orgId?: string) {
  const oauth2Client = getOAuthClient();
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'openid',
    'email',
    'profile'
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: orgId ? String(orgId) : undefined
  });
  return url;
}

export async function storeTokens(orgId: string, tokens: StoredTokens) {
  await ensureDirExists(tokensDir());
  const p = tokenPathForOrg(orgId);
  await fs.writeFile(p, JSON.stringify(tokens, null, 2), 'utf-8');
  const integ = await (prisma as any).integration.findFirst({ where: { name: 'google-calendar' } });
  if (integ) {
    await (prisma as any).integrationConnection.upsert({
      where: { organizationId_integrationId: { organizationId: orgId, integrationId: integ.id } },
      update: { status: 'connected' },
      create: { organizationId: orgId, integrationId: integ.id, status: 'connected' }
    });
  }
}

export async function getStoredTokens(orgId: string): Promise<StoredTokens | null> {
  try {
    const p = tokenPathForOrg(orgId);
    const buf = await fs.readFile(p, 'utf-8');
    return JSON.parse(buf);
  } catch {
    return null;
  }
}

function setClientCredentials(oauth2Client: any, tokens: StoredTokens) {
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens as any);
  try {
    const oauth2 = (google as any).oauth2({ version: 'v2', auth: oauth2Client });
    const info = await oauth2.userinfo.get();
    const email = (info.data as any)?.email;
    const merged: StoredTokens = { ...(tokens as any), email };
    return merged;
  } catch {
    return tokens as StoredTokens;
  }
}

export async function getCalendars(orgId: string) {
  const tokens = await getStoredTokens(orgId);
  if (!tokens) return [];
  const oauth2Client = getOAuthClient();
  setClientCredentials(oauth2Client, tokens);
  const calendar = (google as any).calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.calendarList.list();
  return res.data.items || [];
}

export async function getUpcomingEvents(orgId: string, calendarId: string, maxResults = 10) {
  const tokens = await getStoredTokens(orgId);
  if (!tokens) return [];
  const oauth2Client = getOAuthClient();
  setClientCredentials(oauth2Client, tokens);
  const calendar = (google as any).calendar({ version: 'v3', auth: oauth2Client });
  const now = new Date().toISOString();
  const res = await calendar.events.list({
    calendarId,
    timeMin: now,
    showDeleted: false,
    singleEvents: true,
    maxResults,
    orderBy: 'startTime'
  });
  return res.data.items || [];
}

export async function createEvent(orgId: string, calendarId: string, event: any) {
  const tokens = await getStoredTokens(orgId);
  if (!tokens) throw new Error('Not connected to Google Calendar');
  const oauth2Client = getOAuthClient();
  setClientCredentials(oauth2Client, tokens);
  const calendar = (google as any).calendar({ version: 'v3', auth: oauth2Client });
  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: event,
      conferenceDataVersion: 1
    });
    return res.data;
  } catch (err: any) {
    const msg = String(err?.message || '');
    const code = String((err as any)?.code || '');
    const details = (err as any)?.errors || (err as any)?.response?.data || null;
    console.error('[google] events.insert failed with conferenceData', { code, msg, details });
    try {
      const res2 = await calendar.events.insert({
        calendarId,
        requestBody: event
      });
      return res2.data;
    } catch (err2: any) {
      const msg2 = String(err2?.message || '');
      const code2 = String((err2 as any)?.code || '');
      const details2 = (err2 as any)?.errors || (err2 as any)?.response?.data || null;
      console.error('[google] events.insert fallback failed', { code: code2, msg: msg2, details: details2 });
      throw new Error(`Google events.insert failed: ${msg2 || msg}`);
    }
  }
}

export async function getConnectedAccount(orgId: string) {
  const tokens = await getStoredTokens(orgId);
  if (!tokens) return { connected: false, email: null };
  if (tokens.email) return { connected: true, email: tokens.email };
  try {
    const oauth2Client = getOAuthClient();
    setClientCredentials(oauth2Client, tokens);
    const oauth2 = (google as any).oauth2({ version: 'v2', auth: oauth2Client });
    const info = await oauth2.userinfo.get();
    const email = (info.data as any)?.email || null;
    if (email) {
      await storeTokens(orgId, { ...tokens, email });
    }
    return { connected: true, email };
  } catch {
    return { connected: true, email: null };
  }
}

export async function disconnectGoogle(orgId: string) {
  try {
    const p = tokenPathForOrg(orgId);
    await fs.unlink(p);
    return { success: true };
  } catch {
    return { success: false };
  }
}

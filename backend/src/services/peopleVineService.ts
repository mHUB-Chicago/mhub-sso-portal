import { Context } from 'hono';
import { PeopleVineToken, PeopleVineTokenType, PrismaClient } from '@prisma/client';

const PEOPLEVINE_API_BASE_URL = 'https://api.peoplevine.dev/api';

interface RequestOptions {
  tokenType: PeopleVineTokenType;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  queryParams?: Record<string, string>;
  body?: any;
  headers?: Record<string, string>;
}

const setToken = async (c: Context, tokenType: PeopleVineTokenType, accessToken: string, refreshToken: string, expiresAt: Date): Promise<PeopleVineToken> => {
  const prisma: PrismaClient = c.get('db');
  const existingToken = await prisma.peopleVineToken.findFirst({
    where: {
      tokenType,
    },
  });
  let returnToken: PeopleVineToken;
  if (existingToken) {
    returnToken = await prisma.peopleVineToken.update({
      where: { id: existingToken.id },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });
  } else {
    returnToken = await prisma.peopleVineToken.create({
      data: {
        tokenType,
        accessToken,
        refreshToken,
        expiresAt,
      },
    });
  }
  return returnToken;
}

const getStoredToken = async (c: Context, tokenType: PeopleVineTokenType): Promise<PeopleVineToken | null> => {
  const prisma: PrismaClient = c.get('db');
  const tokenRecord = await prisma.peopleVineToken.findFirst({
    where: {
      tokenType,
    },
  });
  return tokenRecord;
}

const getUserToken = async (c: Context): Promise<PeopleVineToken> => {
  const storedToken = await getStoredToken(c, PeopleVineTokenType.USER);
  // Check if token is still valid (skew by 1 minute)
  if (storedToken && storedToken.expiresAt > new Date(Date.now() + 60000)) {
    return storedToken;
  }
  const peoplevineAdminUsername = c.env.PEOPLEVINE_ADMIN_USERNAME;
  const peoplevineAdminPassword = c.env.PEOPLEVINE_ADMIN_PASSWORD;
  const response = await fetch(`${PEOPLEVINE_API_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: peoplevineAdminUsername,
      password: peoplevineAdminPassword,
      remember_me: true,
      grant_type: 'password',
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    const errorStatus = response.status;
    console.error(`Error response (${errorStatus}): ${errorText}`);
    throw new Error('Failed to obtain user auth token');
  }
  const responseData: any = await response.json();
  const accessToken = responseData.access_token;
  const refreshToken = responseData.refresh_token;
  const expiresIn = responseData.expires_in;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  return setToken(c, PeopleVineTokenType.USER, accessToken, refreshToken, expiresAt);
};

const getUserCompanyToken = async (c: Context): Promise<PeopleVineToken> => {
  const storedToken = await getStoredToken(c, PeopleVineTokenType.USER_COMPANY);
  // Check if token is still valid (skew by 1 minute)
  if (storedToken && storedToken.expiresAt > new Date(Date.now() + 60000)) {
    return storedToken;
  }
  const companyId = parseInt(c.env.PEOPLEVINE_COMPANY_ID as string);
  const userTokenRecord = await getUserToken(c);
  const userToken = userTokenRecord.accessToken;
  const userRefreshToken = userTokenRecord.refreshToken;
  const response = await fetch(`${PEOPLEVINE_API_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'access_token',
      company_id: companyId,
      access_token: userToken,
      refresh_token: userRefreshToken,
      remember_me: true,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    const errorStatus = response.status;
    console.error(`Error response (${errorStatus}): ${errorText}`);
    throw new Error('Failed to obtain user company auth token');
  }
  const responseData: any = await response.json();
  const accessToken = responseData.access_token;
  const expiresIn = responseData.expires_in;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const refreshToken = responseData.refresh_token;
  return setToken(c, PeopleVineTokenType.USER_COMPANY, accessToken, refreshToken, expiresAt);
}

const getAuthToken = async (c: Context, tokenType: PeopleVineTokenType): Promise<PeopleVineToken> => {
  if (tokenType === PeopleVineTokenType.USER) {
    return getUserToken(c);
  } else if (tokenType === PeopleVineTokenType.USER_COMPANY) {
    return getUserCompanyToken(c);
  } else {
    throw new Error('Invalid token type requested');
  }
};

const apiRequest = async (c: Context, options: RequestOptions): Promise<any> => {
  const { endpoint, method, body, headers, queryParams } = options;
  const queryString = queryParams
    ? '?' + new URLSearchParams(queryParams).toString()
    : '';
  const authTokenRecord: PeopleVineToken = await getAuthToken(c, options.tokenType);
  const authToken: string = authTokenRecord.accessToken;
  const baseUrl = PEOPLEVINE_API_BASE_URL;
  const response = await fetch(`${baseUrl}${endpoint}${queryString}`, {
    method,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!response.ok) {
    const resText = await response.text();
    const status = response.status;
    let errorDetails = resText;
    try {
      const resJson = JSON.parse(resText);
      errorDetails = JSON.stringify(resJson, null, 2);
    } catch {}
    throw new Error(`API request failed with status ${status}\n${errorDetails}`);
  }
  return response.json();
}

export const getCompaniesFromSubscriptions = async (c: Context): Promise<any[]> => {
  let subscriptions: any[] = [];
  let pageNumber = 1;
  const pageSize = 100;
  do {
    const retrievedSubscriptions: any[] = await apiRequest(c, {
      tokenType: PeopleVineTokenType.USER_COMPANY,
      endpoint: '/subscriptions',
      method: 'GET',
      queryParams: {
        Status: 'active',
        Page_Size: pageSize.toString(),
        Page_Number: pageNumber.toString(),
      },
    });
    subscriptions = subscriptions.concat(retrievedSubscriptions);
    pageNumber++;
    if (retrievedSubscriptions.length === 0 || retrievedSubscriptions.length < 100) {
      break;
    }
  } while (true);
  let companies = subscriptions.map((sub: any) => sub?.customer || null)
  companies = Array.from(new Map(companies.map(company => [`${company.id}${company.company_name}`, company])).values());
  return companies;
};
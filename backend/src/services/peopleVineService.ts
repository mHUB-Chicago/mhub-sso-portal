import { Context } from 'hono';
import { Company, PeopleVineToken, PeopleVineTokenType, PrismaClient, Role, User } from '@prisma/client';
import { createCompany, deactivateCompany, updateCompany } from './companyService';
import { createUser, deleteUser, updateUser } from './userService';

const PEOPLEVINE_API_BASE_URL = 'https://api.peoplevine.dev/api';

interface RequestOptions {
  tokenType: PeopleVineTokenType;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  queryParams?: Record<string, string>;
  body?: any;
  headers?: Record<string, string>;
}

export interface PeopleVineCustomer {
  id: number;
  company_name: string;
  full_name: string;
  email: string;
  // other fields are available but omitted for brevity and type safety
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

const normalizeCustomers = (customers: PeopleVineCustomer[]): PeopleVineCustomer[] => {
  return customers.map((customer) => ({
    ...customer,
    full_name: customer.full_name ? customer.full_name.trim() : customer.full_name,
    company_name: customer.company_name ? customer.company_name.trim() : customer.company_name,
    email: customer.email ? customer.email.toLowerCase() : customer.email,
  })).filter((customer) => {
    return customer.full_name && customer.full_name.length > 0 && customer.email && customer.email.length > 0;
  });
}

const getCustomersFromSubscriptions = async (c: Context): Promise<PeopleVineCustomer[]> => {
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
  companies = companies.filter(company => company !== null && company.status === 'active');
  return normalizeCustomers(companies);
};

const getCustomers = async (c: Context): Promise<PeopleVineCustomer[]> => {
  let customers: PeopleVineCustomer[] = [];
  let pageNumber = 1;
  const pageSize = 100;
  do {
    const retrievedCustomers: PeopleVineCustomer[] = await apiRequest(c, {
      tokenType: PeopleVineTokenType.USER_COMPANY,
      endpoint: '/customers',
      method: 'GET',
      queryParams: {
        status: 'active',
        page_size: pageSize.toString(),
        page_number: pageNumber.toString(),
      },
    });
    customers = customers.concat(retrievedCustomers);
    pageNumber++;
    if (retrievedCustomers.length === 0 || retrievedCustomers.length < 100) {
      break;
    }
  } while (true);
  return normalizeCustomers(customers);
};

export const syncAll = async (c: Context): Promise<void> => {
  // Get companies from active subscriptions
  const prisma: PrismaClient = c.get('db');
  
  //
  // Step 1: Sync companies based on PeopleVine customers
  //

  // Fetch customers from PeopleVine which have active subscriptions
  const peopleVineCustomersFromSubscriptions: PeopleVineCustomer[] = await getCustomersFromSubscriptions(c);
  
  // Create a map of PeopleVine companies by their PeopleVine ID for easy lookup
  let companyProfilesMap: Map<string, PeopleVineCustomer> = new Map();
  for (const company of peopleVineCustomersFromSubscriptions) {
    companyProfilesMap.set(company.id.toString(), company);
  }

  // Fetch all companies from our database
  let dbCompanies = await prisma.company.findMany();

  // Create a map of DB companies by their PeopleVine ID for easy lookup
  let dbCompaniesMap: Map<string, Company> = new Map();
  for (const dbCompany of dbCompanies) {
    if (dbCompany.peopleVineId) {
      dbCompaniesMap.set(dbCompany.peopleVineId, dbCompany);
    }
  }

  // Process each PeopleVine company and create or update companies accordingly
  await Promise.all(companyProfilesMap.values().map(async (customer) => {
    const peopleVineId = customer.id.toString();
    const existingCompany = dbCompaniesMap.get(peopleVineId);

    // Update company name if changed
    let companyName = customer.company_name.trim();
    if (companyName.length === 0) {
      companyName = customer.full_name.trim().concat("'s Company");
    }
    if (existingCompany) {
      return updateCompany(c, {
        id: existingCompany.id,
        name: companyName,
        active: true,
      });
    } else {
      return createCompany(c, {
        name: companyName,
        peopleVineId: customer.id.toString(),
        active: true,
      });
    }
  }));

  //
  // Step 2: Sync users based on PeopleVine customers
  //

  // Fetch companies again to get updated list with newly created ones
  dbCompanies = await prisma.company.findMany();
  const companiesByNameMap: Map<string, Company> = new Map();
  for (const company of dbCompanies) {
    companiesByNameMap.set(company.name, company);
  }

  // Fetch all customers from PeopleVine
  const allPeopleVineCustomers: PeopleVineCustomer[] = await getCustomers(c);

  // Normalize and map customers by their PeopleVine ID
  const allCustomersMap: Map<string, PeopleVineCustomer> = new Map();
  for (const customer of allPeopleVineCustomers) {
    allCustomersMap.set(customer.id.toString(), customer);
  }

  // Fetch all existing users from our database
  let existingUsers = await prisma.user.findMany();

  // Create a map of existing users by their PeopleVine ID for easy lookup
  let existingUsersMap: Map<string, User> = new Map();
  for (const user of existingUsers) {
    if (user.peopleVineId) {
      existingUsersMap.set(user.peopleVineId, user);
    }
  }

  // Process each customer and create or update users accordingly
  await Promise.all(allCustomersMap.values().map(async (customer) => {
    const peopleVineId = customer.id.toString();
    const existingUser = existingUsersMap.get(peopleVineId);
    let companyName = customer.company_name.trim();
    if (companyName.length === 0) {
      companyName = customer.full_name.trim().concat("'s Company");
    }

    let associatedCompanyByName = companiesByNameMap.get(companyName);
    if (!associatedCompanyByName) {
      console.log(`No associated company found for user ${customer.full_name} (${customer.email}), skipping user creation.`);
      return;
    }

    if (existingUser && associatedCompanyByName.id !== existingUser.companyId) {
      console.log(`User ${customer.full_name} (${customer.email}) is associated with a different company, updating company association.`);
      return updateUser(c, {
        id: existingUser.id,
        name: customer.full_name,
        email: customer.email,
        companyId: associatedCompanyByName.id,
      });
    }

    if (existingUser && associatedCompanyByName.id === existingUser.companyId) {
      console.log(`User ${customer.full_name} (${customer.email}) already exists with correct company association.`);
      if (existingUser.name !== customer.full_name || existingUser.email !== customer.email.toLowerCase()) {
        console.log(`Updating user ${customer.full_name} (${customer.email}) details.`);
        return updateUser(c, {
          id: existingUser.id,
          name: customer.full_name,
          email: customer.email,
        });
      }
    }

    if (!existingUser) {
      console.log(`Creating user for ${customer.full_name} (${customer.email}).`);
      return createUser(c, {
        name: customer.full_name,
        email: customer.email,
        peopleVineId: peopleVineId,
        role: Role.USER,
        companyId: associatedCompanyByName.id,
      });
    }
  }));

  //
  // Step 3: Deactivate any companies or users that no longer exist in PeopleVine
  //

  dbCompanies = await prisma.company.findMany();

  const activePeopleVineIdsForCompanies = new Set<string>(companyProfilesMap.keys());
  const activePeopleVineIdsForUsers = new Set<string>(allCustomersMap.keys());
  
  // Deactivate companies not in PeopleVine
  await Promise.all(dbCompanies.map(async (dbCompany) => {
    if (dbCompany.peopleVineId && !activePeopleVineIdsForCompanies.has(dbCompany.peopleVineId)) {
      console.log(`Deactivating company ${dbCompany.name} as it no longer exists in PeopleVine.`);
      return deactivateCompany(c, dbCompany.id);
    }
  }));

  // Deactivate users not in PeopleVine
  existingUsers = await prisma.user.findMany();
  await Promise.all(existingUsers.map(async (user) => {
    if (user.peopleVineId && !activePeopleVineIdsForUsers.has(user.peopleVineId)) {
      console.log(`Deactivating user ${user.name} (${user.email}) as they no longer exist in PeopleVine.`);
      return deleteUser(c, user.id);
    }
  }));

  console.log('PeopleVine synchronization complete.');
}

export const syncOne = async (c: Context, customer: PeopleVineCustomer): Promise<void> => {
  const prisma: PrismaClient = c.get('db');

  // Normalize customer data
  const normalizedCustomers = normalizeCustomers([customer]);
  if (normalizedCustomers.length === 0) {
    console.log(`Customer data for ID ${customer.id} is invalid after normalization, skipping.`);
    return;
  }
  const normalizedCustomer = normalizedCustomers[0];

  // Fetch customers from PeopleVine which have active subscriptions
  const peopleVineCustomersFromSubscriptions: PeopleVineCustomer[] = await getCustomersFromSubscriptions(c);
  
  // Create a map of PeopleVine companies by their PeopleVine ID for easy lookup
  let companyProfilesMap: Map<string, PeopleVineCustomer> = new Map();
  for (const company of peopleVineCustomersFromSubscriptions) {
    companyProfilesMap.set(company.id.toString(), company);
  }

  let companyName = normalizedCustomer.company_name.trim();
  if (companyName.length === 0) {
    companyName = normalizedCustomer.full_name.trim().concat("'s Company");
  }
  const isCompanyProfile = companyProfilesMap.has(normalizedCustomer.id.toString());
  const existingCompany = await prisma.company.findFirst({
    where: { peopleVineId: normalizedCustomer.id.toString() },
  });

  if (isCompanyProfile) {
    if (existingCompany) {
      await updateCompany(c, {
        id: existingCompany.id,
        name: companyName,
        active: true,
      });
    } else {
      await createCompany(c, {
        name: companyName,
        peopleVineId: normalizedCustomer.id.toString(),
        active: true,
      });
    }
  }

  const associatedCompany = await prisma.company.findFirst({
    where: { name: companyName },
  });
  if (!associatedCompany) {
    console.log(`No associated company found for user ${normalizedCustomer.full_name} (${normalizedCustomer.email}), skipping user creation.`);
    return;
  }
  const associatedUser = await prisma.user.findFirst({
    where: { peopleVineId: normalizedCustomer.id.toString() },
  });

  if (associatedUser) {
    if (associatedUser.name !== normalizedCustomer.full_name || associatedUser.email !== normalizedCustomer.email.toLowerCase() || associatedUser.companyId !== associatedCompany.id) {
      console.log(`Updating user ${normalizedCustomer.full_name} (${normalizedCustomer.email}) details.`);
      await updateUser(c, {
        id: associatedUser.id,
        name: normalizedCustomer.full_name,
        email: normalizedCustomer.email,
        companyId: associatedCompany.id
      });
    }
  } else {
    console.log(`Creating user for ${normalizedCustomer.full_name} (${normalizedCustomer.email}).`);
    await createUser(c, {
      name: normalizedCustomer.full_name,
      email: normalizedCustomer.email,
      peopleVineId: normalizedCustomer.id.toString(),
      role: Role.USER,
      companyId: associatedCompany.id
    });
  }
}
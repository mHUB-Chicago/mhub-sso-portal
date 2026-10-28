export const isSameAsCompanyEmail = (userEmail: string, companyEmail?: string): boolean =>
  !!companyEmail?.trim() && companyEmail.trim().toLowerCase() === userEmail.trim().toLowerCase();

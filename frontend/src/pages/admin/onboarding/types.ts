export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface CompanyDetails {
  name?: string;
  website?: string;
  size?: string;
  founded?: string;
  industry?: string;
  incorporation?: string;
  fundingStage?: string;
  problem?: string;
  targetMarket?: string;
}

export interface PrimaryUserDetails {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  birthday: string;
  phoneCountryCode: string;
  phone: string;
  linkedin: string;
  bio: string;
  gender: string;
  pronouns: string;
  ethnicity: string;
  address: Address;
}

export interface SkillsDetails {
  undergradSchool: string;
  undergradDegree: string;
  gradSchool: string;
  gradDegree: string;
  industryExperience: string;
  skills: string[];
  shopSkills: string[];
}

export type PaymentType = "card" | "bank";

export interface BillingDetails {
  paymentType: PaymentType;
  nameOnCard: string;
  cardNumber: string;
  expiration: string;
  cvc: string;
  address: Address;
}

export type OnboardingMode = "admin" | "link";

export type OnboardingScenario = "new_company" | "existing_company";

export interface OnboardingFormData {
  mode: OnboardingMode;
  scenario: OnboardingScenario;
  companyId?: string;
  company: CompanyDetails;
  user: PrimaryUserDetails;
  membershipPackage: string;
  skills: SkillsDetails;
  billing: BillingDetails;
}

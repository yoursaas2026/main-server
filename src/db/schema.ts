import { pgTable, serial, text, timestamp, varchar, boolean, integer } from 'drizzle-orm/pg-core';

// Developer Table
export const developers = pgTable('developers', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    phone: varchar('phone', { length: 20 }),
    password: text('password'), // nullable for OAuth-only users

    // OAuth Authentication
    googleId: text('google_id').unique(),
    appleId: text('apple_id').unique(),
    microsoftId: text('microsoft_id').unique(),
    authProvider: varchar('auth_provider', { length: 20 }).default('email'), // email, google, apple, microsoft

    // Password Reset
    resetPasswordToken: text('reset_password_token'),
    resetPasswordExpiry: timestamp('reset_password_expiry'),

    // Profile Information
    profilePicture: text('profile_picture'),
    bio: text('bio'),
    skills: text('skills'), // JSON string array of skills
    experience: integer('experience'), // years of experience
    portfolioUrl: text('portfolio_url'),
    githubUrl: text('github_url'),
    linkedinUrl: text('linkedin_url'),

    // KYC (Know Your Customer) Verification
    kycStatus: varchar('kyc_status', { length: 20 }).default('pending'), // pending, submitted, verified, rejected
    kycSubmittedAt: timestamp('kyc_submitted_at'),
    kycVerifiedAt: timestamp('kyc_verified_at'),
    kycRejectedAt: timestamp('kyc_rejected_at'),
    kycRejectionReason: text('kyc_rejection_reason'),

    // KYC Documents
    fullLegalName: text('full_legal_name'),
    dateOfBirth: timestamp('date_of_birth'),
    nationality: varchar('nationality', { length: 100 }),
    governmentIdType: varchar('government_id_type', { length: 50 }), // passport, driving_license, national_id
    governmentIdNumber: varchar('government_id_number', { length: 100 }),
    governmentIdFrontImage: text('government_id_front_image'), // URL to uploaded image
    governmentIdBackImage: text('government_id_back_image'), // URL to uploaded image
    addressProofType: varchar('address_proof_type', { length: 50 }), // utility_bill, bank_statement, etc.
    addressProofImage: text('address_proof_image'), // URL to uploaded image
    selfieImage: text('selfie_image'), // URL to selfie for verification

    // KYC Address Information
    kycAddress: text('kyc_address'),
    kycCity: varchar('kyc_city', { length: 100 }),
    kycState: varchar('kyc_state', { length: 100 }),
    kycCountry: varchar('kyc_country', { length: 100 }),
    kycPostalCode: varchar('kyc_postal_code', { length: 20 }),

    // Status & Verification
    isEmailVerified: boolean('is_email_verified').default(false),
    isPhoneVerified: boolean('is_phone_verified').default(false),
    isAvailable: boolean('is_available').default(true),
    status: varchar('status', { length: 20 }).default('active'), // active, inactive, suspended

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
});

// Client Table
export const clients = pgTable('clients', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    phone: varchar('phone', { length: 20 }),
    password: text('password'), // nullable for OAuth-only users

    // OAuth Authentication
    googleId: text('google_id').unique(),
    appleId: text('apple_id').unique(),
    microsoftId: text('microsoft_id').unique(),
    authProvider: varchar('auth_provider', { length: 20 }).default('email'), // email, google, apple, microsoft

    // Password Reset
    resetPasswordToken: text('reset_password_token'),
    resetPasswordExpiry: timestamp('reset_password_expiry'),

    // Profile Information
    profilePicture: text('profile_picture'),
    companyName: text('company_name'),
    companyWebsite: text('company_website'),
    industry: varchar('industry', { length: 100 }),
    address: text('address'),
    city: varchar('city', { length: 100 }),
    country: varchar('country', { length: 100 }),

    // Business Details
    taxId: varchar('tax_id', { length: 50 }),
    billingAddress: text('billing_address'),

    // Status & Verification
    isEmailVerified: boolean('is_email_verified').default(false),
    isPhoneVerified: boolean('is_phone_verified').default(false),
    status: varchar('status', { length: 20 }).default('active'), // active, inactive, suspended

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
});

// Admin Table (Email/Password Only - No OAuth)
export const admins = pgTable('admins', {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 50 }).unique().notNull(),
    email: text('email').unique().notNull(),
    phone: varchar('phone', { length: 20 }),
    password: text('password').notNull(), // Required - admins must use email/password

    // Password Reset (Email/Password Only)
    resetPasswordToken: text('reset_password_token'),
    resetPasswordExpiry: timestamp('reset_password_expiry'),

    // Profile Information
    name: text('name').notNull(),
    profilePicture: text('profile_picture'),

    // Admin Role & Permissions
    role: varchar('role', { length: 20 }).default('admin'), // super_admin, admin, moderator
    permissions: text('permissions'), // JSON string array of permissions

    // Security & Access
    isSuperAdmin: boolean('is_super_admin').default(false),
    canManageDevelopers: boolean('can_manage_developers').default(true),
    canManageClients: boolean('can_manage_clients').default(true),
    canManageAdmins: boolean('can_manage_admins').default(false),
    canVerifyKYC: boolean('can_verify_kyc').default(false), // Permission to verify developer KYC

    // Status & Verification
    isEmailVerified: boolean('is_email_verified').default(false),
    status: varchar('status', { length: 20 }).default('active'), // active, inactive, suspended

    // Audit Information
    createdBy: integer('created_by'), // admin ID who created this admin

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
});

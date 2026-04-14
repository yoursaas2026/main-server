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
    coverPicture: text('cover_picture'),
    bio: text('bio'),
    skills: text('skills'), // JSON string array of skills
    experience: integer('experience'), // years of experience
    portfolioUrl: text('portfolio_url'),
    githubUrl: text('github_url'),
    linkedinUrl: text('linkedin_url'),
    twitterUrl: text('twitter_url'),
    resumeUrl: text('resume_url'),
    
    // Freelance / Professional Info
    headline: text('headline'),
    location: varchar('location', { length: 100 }),
    company: text('company'),
    hourlyRate: integer('hourly_rate'), // In dollars/rupees
    openToOpenSource: boolean('open_to_open_source').default(false),
    availableForHire: boolean('available_for_hire').default(true),
    servicesOffered: text('services_offered'), // JSON string array of services
    pastExperiences: text('past_experiences'), // Stringified array of past jobs
    portfolioProjects: text('portfolio_projects'), // Stringified array of projects

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
    livenessVideo: text('liveness_video'), // URL to liveness video
    
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
    status: varchar('status', { length: 20 }).default('active'), // active, blocked, suspended
    blockReason: text('block_reason'), // Details on why the developer was blocked

    // Subscription Plan
    plan: varchar('plan', { length: 20 }).default('base'), // base, pro, ultimate
    planBillingCycle: varchar('plan_billing_cycle', { length: 20 }).default('monthly'), // monthly, yearly
    planStartDate: timestamp('plan_start_date'),
    planEndDate: timestamp('plan_end_date'),

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

// Admin Table
export const admins = pgTable('admins', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    password: text('password').notNull(),

    // Profile Information
    profilePicture: text('profile_picture'),

    // Status
    status: varchar('status', { length: 20 }).default('active'), // active, inactive

    // Audit Information
    createdBy: integer('created_by'), // admin ID who created this admin

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
});

// Developer Payments Table
export const developerPayments = pgTable('developer_payments', {
    id: serial('id').primaryKey(),
    developerId: integer('developer_id').references(() => developers.id).notNull(),
    orderId: varchar('order_id', { length: 100 }), // razorpay order id
    paymentId: varchar('payment_id', { length: 100 }), // razorpay payment id
    plan: varchar('plan', { length: 20 }), // pro, ultimate
    billingCycle: varchar('billing_cycle', { length: 20 }), // monthly, yearly
    amount: integer('amount'),
    currency: varchar('currency', { length: 10 }).default('USD'),
    status: varchar('status', { length: 20 }).default('created'), // created, completed, failed
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
});

// Developer SaaS Products (marketplace listings)
export const developerProducts = pgTable('developer_products', {
    id: serial('id').primaryKey(),
    developerId: integer('developer_id').references(() => developers.id).notNull(),
    projectId: varchar('project_id', { length: 120 }).notNull(),

    slug: varchar('slug', { length: 160 }).notNull().unique(),
    name: text('name').notNull(),
    productCategoryId: integer('product_category_id'),
    tagline: text('tagline'),

    shortDescription: text('short_description'),
    problem: text('problem'),
    solution: text('solution'),
    featuresTagline: text('features_tagline'),
    featuresAboutBody: text('features_about_body'),

    // JSON strings for structured fields from developer portal
    benefits: text('benefits'),
    features: text('features'),
    useCases: text('use_cases'),
    audienceTags: text('audience_tags'),
    customizationTiers: text('customization_tiers'),

    trialDays: integer('trial_days').default(0),
    freeTrial: boolean('free_trial').default(false),
    deploymentTime: text('deployment_time'),
    bestFor: text('best_for'),

    // Technical section
    technicalStack: text('technical_stack'),
    technicalDeployment: text('technical_deployment'),
    technicalIntegrations: text('technical_integrations'),
    technicalPlatforms: text('technical_platforms'),
    technicalApi: text('technical_api'),
    technicalSecurity: text('technical_security'),
    technicalCompliance: text('technical_compliance'),

    // Demo/support
    iconUrl: text('icon_url'),
    screenshotUrls: text('screenshot_urls'),
    demoUrl: text('demo_url'),
    demoUser: text('demo_user'),
    demoPassword: text('demo_password'),
    demoVideoId: text('demo_video_id'),
    supportDocs: text('support_docs'),
    supportEmail: text('support_email'),
    supportChat: text('support_chat'),
    supportResponse: text('support_response'),

    // Legal
    legalPrivacy: text('legal_privacy'),
    legalTerms: text('legal_terms'),
    legalRefund: text('legal_refund'),

    // Marketplace badges/toggles
    marketplaceCustomization: boolean('marketplace_customization').default(true),
    marketplaceWhiteLabel: boolean('marketplace_white_label').default(false),
    marketplaceDeploymentSupport: boolean('marketplace_deployment_support').default(false),
    marketplaceOnboardingSupport: boolean('marketplace_onboarding_support').default(false),

    // Listing metadata
    metaVersion: text('meta_version'),
    metaReleaseNotesUrl: text('meta_release_notes_url'),
    metaSetupTime: text('meta_setup_time'),
    metaDifficulty: text('meta_difficulty'),
    metaRequirements: text('meta_requirements'),

    trustVerifiedListing: boolean('trust_verified_listing').default(false),
    trustVerifiedByPlatform: boolean('trust_verified_by_platform').default(false),
    /** Platform ops / admin only — not editable via developer product upsert. */
    trustYourSaaSCertified: boolean('trust_yoursaas_certified').default(false),
    listingStatus: varchar('listing_status', { length: 20 }).default('draft'),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const productCategories = pgTable('product_categories', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 80 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

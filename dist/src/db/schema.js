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
    /** Local / NEFT payouts — encrypted storage recommended in production */
    payoutBankCountry: varchar('payout_bank_country', { length: 100 }),
    payoutAccountHolderName: text('payout_account_holder_name'),
    payoutBankName: text('payout_bank_name'),
    /** IFSC (IN), routing (US), or SWIFT/BIC depending on country */
    payoutRoutingCode: varchar('payout_routing_code', { length: 34 }),
    payoutAccountNumber: text('payout_account_number'),
    payoutAccountType: varchar('payout_account_type', { length: 24 }), // savings, current
    payoutBankDetailsUpdatedAt: timestamp('payout_bank_details_updated_at'),
    /** Cashfree Payouts beneficiary id from last verification attempt */
    payoutCashfreeBeneficiaryId: varchar('payout_cashfree_beneficiary_id', { length: 64 }),
    payoutBankValidationId: varchar('payout_bank_validation_id', { length: 64 }),
    /** created | completed | failed (Cashfree beneficiary verification status) */
    payoutBankValidationStatus: varchar('payout_bank_validation_status', { length: 24 }),
    /** When completed: valid | invalid | … from validation_results.account_status */
    payoutBankValidationAccountStatus: varchar('payout_bank_validation_account_status', { length: 32 }),
    payoutBankValidationDetails: text('payout_bank_validation_details'),
    payoutBankValidationAt: timestamp('payout_bank_validation_at'),
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
    /** business | individual */
    accountType: varchar('account_type', { length: 20 }),
    /** founder, ops, it, product, procurement, other */
    buyerRole: varchar('buyer_role', { length: 80 }),
    /** startup, smb, midmarket, enterprise */
    companySize: varchar('company_size', { length: 32 }),
    /** JSON string array — launch_product, internal_tool, automate_ops, buy_customize_saas, replace_tool */
    primaryGoals: text('primary_goals'),
    /** JSON string array of product_categories.id */
    interestedCategoryIds: text('interested_category_ids'),
    /** lt_50k, 50k_2l, 2l_10l, gt_10l (INR bands) */
    budgetBand: varchar('budget_band', { length: 24 }),
    /** exploring, 1_3_months, asap */
    timeline: varchar('timeline', { length: 24 }),
    /** non_technical, some_technical, engineering_team */
    technicalComfort: varchar('technical_comfort', { length: 32 }),
    problemStatement: text('problem_statement'),
    /** JSON string array of preferred tech stacks */
    preferredStacks: text('preferred_stacks'),
    /** JSON string array of saved developer_products.id */
    savedProductIds: text('saved_product_ids'),
    onboardingCompletedAt: timestamp('onboarding_completed_at'),
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
    // Password reset
    resetPasswordToken: text('reset_password_token'),
    resetPasswordExpiry: timestamp('reset_password_expiry'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
});
// Developer Payments Table
export const developerPayments = pgTable('developer_payments', {
    id: serial('id').primaryKey(),
    developerId: integer('developer_id').references(() => developers.id).notNull(),
    orderId: varchar('order_id', { length: 100 }), // Cashfree order id
    paymentId: varchar('payment_id', { length: 100 }), // Cashfree cf_payment_id
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
export const clientListingEvents = pgTable('client_listing_events', {
    id: serial('id').primaryKey(),
    clientId: integer('client_id').references(() => clients.id).notNull(),
    productId: integer('product_id').references(() => developerProducts.id).notNull(),
    eventType: varchar('event_type', { length: 24 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});
export const productCategories = pgTable('product_categories', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 80 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
export const productReviews = pgTable('product_reviews', {
    id: serial('id').primaryKey(),
    productId: integer('product_id').references(() => developerProducts.id).notNull(),
    clientId: integer('client_id').references(() => clients.id).notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment').notNull(),
    developerReply: text('developer_reply'),
    developerRepliedAt: timestamp('developer_replied_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
/** Marketplace escrow-style contracts between a client and a developer for a product listing */
export const contracts = pgTable('contracts', {
    id: serial('id').primaryKey(),
    publicId: varchar('public_id', { length: 36 }).notNull().unique(),
    clientId: integer('client_id').references(() => clients.id).notNull(),
    developerId: integer('developer_id').references(() => developers.id).notNull(),
    productId: integer('product_id').references(() => developerProducts.id).notNull(),
    status: varchar('status', { length: 48 }).notNull(),
    planTier: varchar('plan_tier', { length: 16 }),
    scopeText: text('scope_text').notNull(),
    deliverablesText: text('deliverables_text'),
    deadlineAt: timestamp('deadline_at').notNull(),
    grossAmountPaise: integer('gross_amount_paise').notNull(),
    nonRefundableFeePaise: integer('non_refundable_fee_paise').notNull().default(0),
    escrowAmountPaise: integer('escrow_amount_paise').notNull(),
    currency: varchar('currency', { length: 8 }).default('INR'),
    lockedFieldsAt: timestamp('locked_fields_at'),
    version: integer('version').notNull().default(1),
    submittedAt: timestamp('submitted_at'),
    completedAt: timestamp('completed_at'),
    clientDecisionDeadlineAt: timestamp('client_decision_deadline_at'),
    escrowFrozen: boolean('escrow_frozen').default(false),
    developerReleasedPaise: integer('developer_released_paise'),
    platformReleasedPaise: integer('platform_released_paise'),
    payoutNotes: text('payout_notes'),
    /** pending | executed | partial | failed | skipped */
    settlementStatus: varchar('settlement_status', { length: 24 }),
    settlementMetaJson: text('settlement_meta_json'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
export const contractEvents = pgTable('contract_events', {
    id: serial('id').primaryKey(),
    contractId: integer('contract_id').references(() => contracts.id).notNull(),
    fromStatus: varchar('from_status', { length: 48 }),
    toStatus: varchar('to_status', { length: 48 }).notNull(),
    actorRole: varchar('actor_role', { length: 24 }).notNull(),
    actorId: integer('actor_id'),
    metaJson: text('meta_json'),
    createdAt: timestamp('created_at').defaultNow(),
});
export const contractAmendments = pgTable('contract_amendments', {
    id: serial('id').primaryKey(),
    contractId: integer('contract_id').references(() => contracts.id).notNull(),
    amendmentNumber: integer('amendment_number').notNull(),
    proposedByClient: boolean('proposed_by_client').notNull(),
    proposerId: integer('proposer_id').notNull(),
    scopeText: text('scope_text').notNull(),
    deadlineAt: timestamp('deadline_at').notNull(),
    additionalAmountPaise: integer('additional_amount_paise').notNull().default(0),
    status: varchar('status', { length: 32 }).notNull(),
    counterpartyApprovedAt: timestamp('counterparty_approved_at'),
    paymentOrderId: varchar('payment_order_id', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow(),
    appliedAt: timestamp('applied_at'),
});
export const contractDisputes = pgTable('contract_disputes', {
    id: serial('id').primaryKey(),
    contractId: integer('contract_id').references(() => contracts.id).notNull(),
    openedByClient: boolean('opened_by_client').notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('open'),
    adminResolution: text('admin_resolution'),
    refundClientPaise: integer('refund_client_paise').default(0),
    releaseDeveloperPaise: integer('release_developer_paise').default(0),
    retainPlatformPaise: integer('retain_platform_paise').default(0),
    resolvedAt: timestamp('resolved_at'),
    resolvedByAdminId: integer('resolved_by_admin_id').references(() => admins.id),
    createdAt: timestamp('created_at').defaultNow(),
});
export const contractPayments = pgTable('contract_payments', {
    id: serial('id').primaryKey(),
    contractId: integer('contract_id').references(() => contracts.id).notNull(),
    amendmentId: integer('amendment_id').references(() => contractAmendments.id),
    purpose: varchar('purpose', { length: 32 }).notNull(),
    orderId: varchar('order_id', { length: 100 }),
    paymentId: varchar('payment_id', { length: 100 }),
    refundId: varchar('refund_id', { length: 100 }),
    refundAmountPaise: integer('refund_amount_paise').default(0),
    amountPaise: integer('amount_paise').notNull(),
    status: varchar('status', { length: 20 }).default('created'),
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
});
/** Footer / marketing newsletter subscribers (stored locally, sent via Mailu). */
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    firstName: varchar('first_name', { length: 80 }).notNull(),
    lastName: varchar('last_name', { length: 80 }).notNull(),
    source: varchar('source', { length: 40 }).default('footer'),
    unsubscribeToken: varchar('unsubscribe_token', { length: 64 }).unique().notNull(),
    subscribedAt: timestamp('subscribed_at').defaultNow().notNull(),
    unsubscribedAt: timestamp('unsubscribed_at'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

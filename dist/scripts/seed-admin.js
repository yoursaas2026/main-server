import { db } from '../src/db/index.js';
import { admins } from '../src/db/schema.js';
import { hashPassword } from '../src/utils/password.js';
async function seedFirstAdmin() {
    console.log('Seeding the first admin...');
    const email = process.argv[2] || 'admin@yoursaas.com';
    const password = process.argv[3] || 'AdminStrictPass123!';
    try {
        const hashedPassword = await hashPassword(password);
        await db.insert(admins).values({
            name: 'Super Admin',
            email: email,
            password: hashedPassword,
            status: 'active',
        });
        console.log('Successfully injected first administrator.');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        process.exit(0);
    }
    catch (e) {
        console.error('Error seeding admin (might already exist):', e);
        process.exit(1);
    }
}
seedFirstAdmin();

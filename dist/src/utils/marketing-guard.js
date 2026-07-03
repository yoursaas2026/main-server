export function getJwtUser(c) {
    return c.get('user') ?? null;
}
export function assertAdmin(c) {
    const user = getJwtUser(c);
    if (!user || user.role !== 'admin')
        return null;
    return user;
}
export function assertMarketing(c) {
    const user = getJwtUser(c);
    if (!user || user.role !== 'marketing')
        return null;
    return user;
}

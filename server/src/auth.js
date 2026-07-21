import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'gacatboo-dev-secret-change-me';
const TOKEN_TTL = '7d';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Auth middleware: accepts token from cookie or Authorization: Bearer header.
export function requireAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.token || bearer;
  if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '유효하지 않은 인증입니다.' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

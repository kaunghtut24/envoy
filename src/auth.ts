import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export const ROLES = {
    DIPLOMAT: "diplomat",   // full access — approve, commission, command
    STAFF: "staff",         // read + commission tasks, cannot approve outbound actions
    READONLY: "readonly",   // GET endpoints only
};

export interface JWTPayload {
    sub: string;
    role: string;
    iat?: number;
    exp?: number;
}

declare global {
    namespace Express {
        interface Request {
            diplomat?: JWTPayload;
        }
    }
}

const getSecret = () => {
    const secret = process.env.ENVOY_JWT_SECRET;
    if (!secret) {
        throw new Error("Missing ENVOY_JWT_SECRET environment variable");
    }
    return secret;
}

export function generateToken(diplomatId: string, role: string): string {
    return jwt.sign(
        { sub: diplomatId, role },
        getSecret(),
        { expiresIn: "12h" }
    );
}

export function verifyToken(token: string): JWTPayload | null {
    try {
        const decoded = jwt.verify(token, getSecret()) as JWTPayload;
        return decoded;
    } catch (err) {
        return null;
    }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyToken(token);

    if (!payload) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    req.diplomat = payload;
    next();
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
    if (!req.diplomat || req.diplomat.role !== ROLES.DIPLOMAT) {
        return res.status(403).json({ error: "Forbidden: Diplomat access required" });
    }
    next();
}

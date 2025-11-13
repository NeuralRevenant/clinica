import type { FastifyInstance } from 'fastify';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import argon2 from 'argon2';

type DbUser = {
  _id?: any;
  email: string;
  passwordHash: string;
  roles: string[];
  scopes: string[];
  tenantId?: string;
};

export default async function routes(fastify: FastifyInstance) {
  function signAccessToken(payload: {
    sub: string; email: string; roles?: string[]; scopes?: string[]; tenantId?: string;
  }) {
    const iss = process.env.JWT_ISSUER || 'clinica';
    const aud = process.env.JWT_AUDIENCE || 'clinica-api';
    const expiresIn: SignOptions['expiresIn'] = process.env.JWT_EXPIRES_IN ?? '30m';

    const rsPrivate = process.env.JWT_PRIVATE_KEY; // RS256 private key
    const hsSecret = process.env.JWT_SECRET ?? 'dev-secret'; // HS256 secret

    if (rsPrivate) {
      return jwt.sign(
        { ...payload, iss, aud },
        rsPrivate,
        { algorithm: 'RS256', expiresIn }
      );
    }
  }
}
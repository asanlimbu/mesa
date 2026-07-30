/**
 * Registration, login and identity.
 */

import bcrypt from 'bcryptjs';

import { prisma } from '../db.js';
import { config } from '../config.js';
import { signToken } from '../lib/token.js';
import { ROLES } from '../lib/constants.js';
import { conflict, unauthorized, validationFailed } from '../lib/errors.js';
import { validateRegistration, validateLogin } from '../lib/validation.js';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
};

export async function register({ name, email, password, role }) {
  const errors = validateRegistration({ name, email, password, role });
  if (errors) throw validationFailed(errors);

  const normalisedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
  if (existing) {
    throw conflict('EMAIL_TAKEN', 'An account with that email already exists.');
  }

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalisedEmail,
      passwordHash: await bcrypt.hash(password, config.bcryptRounds),
      role: role === ROLES.MANAGER ? ROLES.MANAGER : ROLES.DINER,
    },
    select: PUBLIC_FIELDS,
  });

  return { user, token: signToken(user) };
}

export async function login({ email, password }) {
  const errors = validateLogin({ email, password });
  if (errors) throw validationFailed(errors);

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  // One message for both "no such user" and "wrong password", so the endpoint
  // cannot be used to discover which email addresses are registered. The dummy
  // hash keeps the timing comparable when the user does not exist.
  const hash =
    user?.passwordHash ??
    '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';

  const passwordMatches = await bcrypt.compare(password, hash);

  if (!user || !passwordMatches) {
    throw unauthorized('Email or password is incorrect.');
  }

  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };

  return { user: publicUser, token: signToken(publicUser) };
}

export async function currentUser(userId) {
  return prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_FIELDS });
}

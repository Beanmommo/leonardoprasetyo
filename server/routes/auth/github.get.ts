import { db, schema } from 'hub:db'
import { and, eq, or, sql } from 'drizzle-orm'

export default defineOAuthGitHubEventHandler({
  config: {
    // The administrator allowlist accepts either the GitHub username or the
    // account's primary email, including when that email is private.
    emailRequired: true
  },
  async onSuccess(event, { user: ghUser }) {
    const session = await getUserSession(event)
    const githubEmail = ghUser.email?.trim().toLowerCase() || ''
    const githubUsername = ghUser.login.trim().toLowerCase()

    const adminIdentity = await db.query.users.findFirst({
      where: () => and(
        eq(schema.users.role, 'admin'),
        or(
          and(
            sql`${githubEmail} <> ''`,
            sql`lower(${schema.users.email}) = ${githubEmail}`
          ),
          sql`lower(${schema.users.username}) = ${githubUsername}`
        )
      )
    })

    let user = await db.query.users.findFirst({
      where: () => and(
        eq(schema.users.provider, 'github'),
        eq(schema.users.providerId, ghUser.id.toString())
      )
    })

    const githubProfile = {
      name: ghUser.name || '',
      email: githubEmail,
      avatar: ghUser.avatar_url || '',
      username: ghUser.login,
      provider: 'github' as const,
      providerId: ghUser.id.toString()
    }

    if (adminIdentity && user && adminIdentity.id !== user.id) {
      await db.batch([
        db.update(schema.chats).set({ userId: user.id }).where(eq(schema.chats.userId, adminIdentity.id)),
        db.delete(schema.users).where(eq(schema.users.id, adminIdentity.id)),
        db.update(schema.users).set({
          ...githubProfile,
          role: 'admin'
        }).where(eq(schema.users.id, user.id))
      ])
      user = await db.query.users.findFirst({
        where: () => eq(schema.users.id, user!.id)
      })
    } else if (adminIdentity) {
      [user] = await db.update(schema.users).set({
        ...githubProfile,
        role: 'admin'
      }).where(eq(schema.users.id, adminIdentity.id)).returning()
    } else if (!user) {
      [user] = await db.insert(schema.users).values({
        id: session.id,
        ...githubProfile,
        role: 'user'
      }).returning()
    } else {
      const [updatedUser] = await db.update(schema.users).set({
        ...githubProfile
      }).where(eq(schema.users.id, user.id)).returning()
      user = updatedUser || user
    }

    if (!user) {
      throw createError({ statusCode: 500, statusMessage: 'GitHub user could not be persisted' })
    }

    // Assign anonymous chats with the pre-login session id to the persisted
    // GitHub identity, including when a seeded administrator row was claimed.
    await db.update(schema.chats).set({
      userId: user.id
    }).where(eq(schema.chats.userId, session.id))

    await setUserSession(event, { user })

    return sendRedirect(event, '/admin')
  },
  // Optional, will return a json error and 401 status code by default
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/admin')
  }
})

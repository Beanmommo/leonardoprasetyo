import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, check } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  username: text('username').notNull(),
  provider: text('provider', { enum: ['github'] }).notNull(),
  providerId: text('provider_id').notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  ...timestamps
}, table => [
  uniqueIndex('users_provider_id_idx').on(table.provider, table.providerId)
])

export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats)
}))

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title'),
  userId: text('user_id').notNull(),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('private'),
  ...timestamps
}, table => [
  index('chats_user_id_idx').on(table.userId)
])

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id]
  }),
  messages: many(messages)
}))

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  parts: text('parts', { mode: 'json' }),
  ...timestamps
}, table => [
  index('messages_chat_id_idx').on(table.chatId)
])

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id]
  })
}))

export const votes = sqliteTable('votes', {
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  isUpvoted: integer('is_upvoted', { mode: 'boolean' }).notNull()
}, table => [
  primaryKey({ columns: [table.chatId, table.messageId] })
])

export const votesRelations = relations(votes, ({ one }) => ({
  chat: one(chats, {
    fields: [votes.chatId],
    references: [chats.id]
  }),
  message: one(messages, {
    fields: [votes.messageId],
    references: [messages.id]
  })
}))

export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: text('owner_id').notNull().default('portfolio-admin'),
  r2Key: text('r2_key').notNull(),
  originalName: text('original_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksumSha256: text('checksum_sha256').notNull(),
  role: text('role', { enum: ['resume', 'document'] }).notNull().default('document'),
  status: text('status', { enum: ['uploaded', 'processing', 'ready', 'failed', 'deleted'] }).notNull().default('uploaded'),
  errorMessage: text('error_message'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  pageCount: integer('page_count'),
  vectorMutationId: text('vector_mutation_id'),
  ingestionId: text('ingestion_id'),
  indexedAt: integer('indexed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp' })
}, table => [
  uniqueIndex('uploads_r2_key_idx').on(table.r2Key),
  uniqueIndex('uploads_checksum_idx').on(table.checksumSha256),
  uniqueIndex('uploads_one_resume_idx').on(table.role).where(sql`${table.role} = 'resume' AND ${table.status} <> 'deleted'`),
  index('uploads_role_status_idx').on(table.role, table.status, table.isActive),
  index('uploads_public_status_idx').on(table.isPublic, table.status, table.isActive),
  index('uploads_created_idx').on(table.createdAt),
  check('uploads_size_nonnegative', sql`${table.sizeBytes} >= 0`),
  check('uploads_page_count_nonnegative', sql`${table.pageCount} IS NULL OR ${table.pageCount} >= 0`)
])

export const uploadsRelations = relations(uploads, ({ many }) => ({
  chunks: many(documentChunks),
  indexingTasks: many(indexingTasks)
}))

export const documentChunks = sqliteTable('document_chunks', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().references(() => uploads.id, { onDelete: 'cascade' }),
  vectorId: text('vector_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  pageNumber: integer('page_number').notNull(),
  textContent: text('text_content').notNull(),
  charStart: integer('char_start'),
  charEnd: integer('char_end'),
  tokenCount: integer('token_count'),
  contentHash: text('content_hash').notNull(),
  ingestionId: text('ingestion_id').notNull().default('legacy'),
  embeddingModel: text('embedding_model').notNull(),
  embeddingDimensions: integer('embedding_dimensions').notNull(),
  indexedAt: integer('indexed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  uniqueIndex('document_chunks_vector_idx').on(table.vectorId),
  uniqueIndex('document_chunks_upload_generation_chunk_idx').on(table.uploadId, table.ingestionId, table.chunkIndex),
  index('document_chunks_upload_page_idx').on(table.uploadId, table.pageNumber, table.chunkIndex),
  check('document_chunks_chunk_index_nonnegative', sql`${table.chunkIndex} >= 0`),
  check('document_chunks_page_positive', sql`${table.pageNumber} > 0`),
  check('document_chunks_dimensions_positive', sql`${table.embeddingDimensions} > 0`)
])

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  upload: one(uploads, {
    fields: [documentChunks.uploadId],
    references: [uploads.id]
  })
}))

export const indexingTasks = sqliteTable('indexing_tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  uploadId: text('upload_id').notNull().references(() => uploads.id),
  workflowInstanceId: text('workflow_instance_id').notNull(),
  status: text('status', { enum: ['queued', 'processing', 'ready', 'failed'] }).notNull().default('queued'),
  stage: text('stage', {
    enum: [
      'queued',
      'reading_pdf',
      'extracting_text',
      'chunking_text',
      'generating_embeddings',
      'saving_chunks',
      'publishing_vectors',
      'verifying_vectors',
      'activating_document',
      'cleaning_previous',
      'complete',
      'failed'
    ]
  }).notNull().default('queued'),
  progressCurrent: integer('progress_current').notNull().default(0),
  progressTotal: integer('progress_total'),
  pageCount: integer('page_count'),
  chunkCount: integer('chunk_count'),
  embeddingModel: text('embedding_model'),
  embeddingDimensions: integer('embedding_dimensions'),
  extractionMethod: text('extraction_method', { enum: ['pdf-parse', 'cloudflare-markdown', 'existing'] }),
  attempt: integer('attempt').notNull().default(0),
  errorMessage: text('error_message'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  uniqueIndex('indexing_tasks_workflow_instance_idx').on(table.workflowInstanceId),
  index('indexing_tasks_status_created_idx').on(table.status, table.createdAt),
  index('indexing_tasks_upload_created_idx').on(table.uploadId, table.createdAt),
  check('indexing_tasks_progress_current_nonnegative', sql`${table.progressCurrent} >= 0`),
  check('indexing_tasks_progress_total_nonnegative', sql`${table.progressTotal} IS NULL OR ${table.progressTotal} >= 0`),
  check('indexing_tasks_attempt_nonnegative', sql`${table.attempt} >= 0`)
])

export const indexingTasksRelations = relations(indexingTasks, ({ one }) => ({
  upload: one(uploads, {
    fields: [indexingTasks.uploadId],
    references: [uploads.id]
  })
}))

// The physical table and constraint names are retained for migration
// compatibility; application code treats this as a Library-document lease.
export const documentIngestionLeases = sqliteTable('resume_ingestion_leases', {
  leaseName: text('lease_name').primaryKey(),
  ownerId: text('owner_id').notNull(),
  uploadId: text('upload_id').notNull().references(() => uploads.id),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  check('resume_ingestion_lease_name', sql`${table.leaseName} = 'resume-publication'`),
  index('resume_ingestion_leases_expires_idx').on(table.expiresAt)
])

export const questionUsage = sqliteTable('question_usage', {
  usageDateUtc: text('usage_date_utc').notNull(),
  ipHash: text('ip_hash').notNull(),
  questionCount: integer('question_count').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  primaryKey({ columns: [table.usageDateUtc, table.ipHash] }),
  check('question_usage_count_range', sql`${table.questionCount} >= 0 AND ${table.questionCount} <= 5`)
])

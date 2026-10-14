-- Aila Writer (docs/products/WRITER.md §48-50): projects, the document
-- hierarchy, versions, research items, reference files and exports.
-- Additive only: new enums, new tables and their foreign keys. No existing
-- table or column changes, so no backfill is needed.

-- CreateEnum
CREATE TYPE "WriterDocumentType" AS ENUM ('BOOK', 'NOVEL', 'NONFICTION', 'REPORT', 'THESIS', 'MANUSCRIPT', 'GUIDE', 'ARTICLE', 'BLOG', 'DOCUMENTATION', 'RESEARCH_NOTES', 'OTHER');

-- CreateEnum
CREATE TYPE "WriterNodeKind" AS ENUM ('DOCUMENT', 'PART', 'CHAPTER', 'SECTION');

-- CreateEnum
CREATE TYPE "WriterNodeStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVISED', 'FINAL');

-- CreateEnum
CREATE TYPE "WriterVersionSource" AS ENUM ('MANUAL', 'MILESTONE', 'AI', 'RESTORE');

-- CreateEnum
CREATE TYPE "WriterResearchKind" AS ENUM ('QUESTION', 'NOTE', 'SOURCE');

-- CreateEnum
CREATE TYPE "WriterExportFormat" AS ENUM ('PDF', 'DOCX', 'EPUB');

-- CreateEnum
CREATE TYPE "WriterExportStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "WriterProject" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "documentType" "WriterDocumentType" NOT NULL DEFAULT 'BOOK',
    "language" TEXT NOT NULL DEFAULT 'en',
    "audience" TEXT,
    "authorName" TEXT,
    "goals" TEXT,
    "styleInstructions" TEXT,
    "terminology" TEXT,
    "contextNotes" TEXT,
    "wordGoal" INTEGER,
    "chapterGoal" INTEGER,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WriterProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterNode" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdById" TEXT NOT NULL,
    "kind" "WriterNodeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "position" INTEGER NOT NULL,
    "status" "WriterNodeStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL DEFAULT '',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WriterNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterVersion" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "createdById" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "source" "WriterVersionSource" NOT NULL,
    "label" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WriterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterResearchItem" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "WriterResearchKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "sourceTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriterResearchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterReference" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WriterReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterExport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT,
    "fileId" TEXT,
    "createdById" TEXT NOT NULL,
    "format" "WriterExportFormat" NOT NULL,
    "status" "WriterExportStatus" NOT NULL DEFAULT 'PROCESSING',
    "requestKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WriterExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WriterProject_accountId_status_updatedAt_idx" ON "WriterProject"("accountId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "WriterProject_createdById_idx" ON "WriterProject"("createdById");

-- CreateIndex
CREATE INDEX "WriterNode_projectId_parentId_position_idx" ON "WriterNode"("projectId", "parentId", "position");

-- CreateIndex
CREATE INDEX "WriterNode_accountId_projectId_idx" ON "WriterNode"("accountId", "projectId");

-- CreateIndex
CREATE INDEX "WriterNode_projectId_deletedAt_idx" ON "WriterNode"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "WriterVersion_accountId_projectId_idx" ON "WriterVersion"("accountId", "projectId");

-- CreateIndex
CREATE INDEX "WriterVersion_nodeId_createdAt_idx" ON "WriterVersion"("nodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WriterVersion_nodeId_versionNumber_key" ON "WriterVersion"("nodeId", "versionNumber");

-- CreateIndex
CREATE INDEX "WriterResearchItem_projectId_createdAt_idx" ON "WriterResearchItem"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WriterResearchItem_accountId_idx" ON "WriterResearchItem"("accountId");

-- CreateIndex
CREATE INDEX "WriterReference_accountId_idx" ON "WriterReference"("accountId");

-- CreateIndex
CREATE INDEX "WriterReference_fileId_idx" ON "WriterReference"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "WriterReference_projectId_fileId_key" ON "WriterReference"("projectId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "WriterExport_fileId_key" ON "WriterExport"("fileId");

-- CreateIndex
CREATE INDEX "WriterExport_projectId_createdAt_idx" ON "WriterExport"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WriterExport_accountId_requestKey_key" ON "WriterExport"("accountId", "requestKey");

-- AddForeignKey
ALTER TABLE "WriterProject" ADD CONSTRAINT "WriterProject_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterProject" ADD CONSTRAINT "WriterProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterNode" ADD CONSTRAINT "WriterNode_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterNode" ADD CONSTRAINT "WriterNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WriterProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterNode" ADD CONSTRAINT "WriterNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WriterNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterNode" ADD CONSTRAINT "WriterNode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterVersion" ADD CONSTRAINT "WriterVersion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterVersion" ADD CONSTRAINT "WriterVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WriterProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterVersion" ADD CONSTRAINT "WriterVersion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "WriterNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterVersion" ADD CONSTRAINT "WriterVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterResearchItem" ADD CONSTRAINT "WriterResearchItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterResearchItem" ADD CONSTRAINT "WriterResearchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WriterProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterResearchItem" ADD CONSTRAINT "WriterResearchItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterReference" ADD CONSTRAINT "WriterReference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterReference" ADD CONSTRAINT "WriterReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WriterProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterReference" ADD CONSTRAINT "WriterReference_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterReference" ADD CONSTRAINT "WriterReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterExport" ADD CONSTRAINT "WriterExport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterExport" ADD CONSTRAINT "WriterExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WriterProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterExport" ADD CONSTRAINT "WriterExport_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "WriterNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterExport" ADD CONSTRAINT "WriterExport_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterExport" ADD CONSTRAINT "WriterExport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


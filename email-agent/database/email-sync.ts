import { EmailSearcher } from "./email-search";
import { DatabaseManager, EmailRecord, Attachment } from "./database-manager";
import { ListenersManager } from "../ccsdk/listeners-manager";
import type { Email } from "../agent/custom_scripts/types";

interface SyncOptions {
  folder?: string;
  since?: Date;
  before?: Date;
  limit?: number;
  markAsRead?: boolean;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachments?: boolean;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  searchText?: string;
  excludeFolders?: string[];
  sizeMin?: number;
  sizeMax?: number;
}

export class EmailSyncService {
  private emailSearcher: EmailSearcher;
  private dbManager: DatabaseManager;
  private listenersManager?: ListenersManager;

  constructor(dbManager: DatabaseManager, listenersManager?: ListenersManager) {
    this.emailSearcher = new EmailSearcher();
    this.dbManager = dbManager;
    this.listenersManager = listenersManager;
  }

  // 解析邮件地址（处理 "Name <email@domain.com>" 格式）
  private parseEmailAddress(addressString: string): { address: string; name?: string }[] {
    if (!addressString) return [];

    const addresses: { address: string; name?: string }[] = [];
    const parts = addressString.split(",").map(s => s.trim());

    for (const part of parts) {
      const match = part.match(/^(.+?)\s*<(.+?)>$/);
      if (match) {
        addresses.push({ name: match[1].trim(), address: match[2].toLowerCase() });
      } else if (part.includes("@")) {
        addresses.push({ address: part.toLowerCase() });
      }
    }

    return addresses;
  }

  // 从解析后的邮件中提取收件人地址文本
  private extractAddressesText(parsed: any, field: 'to' | 'cc' | 'bcc'): string {
    if (!parsed[field]) return "";

    const addresses = Array.isArray(parsed[field]) ? parsed[field] : [parsed[field]];
    const results: string[] = [];

    for (const item of addresses) {
      if (item.value) {
        for (const addr of item.value) {
          if (addr.address) results.push(addr.address.toLowerCase());
        }
      } else if (typeof item === "string") {
        const parsed = this.parseEmailAddress(item);
        for (const addr of parsed) {
          results.push(addr.address);
        }
      }
    }

    return results.join(", ");
  }

  // 从解析后的邮件中提取附件
  private extractAttachments(parsedEmail: any): Attachment[] {
    const attachments: Attachment[] = [];

    if (parsedEmail.attachments && Array.isArray(parsedEmail.attachments)) {
      for (const att of parsedEmail.attachments) {
        attachments.push({
          filename: att.filename || "unnamed",
          contentType: att.contentType,
          sizeBytes: att.size || 0,
          contentId: att.contentId,
          isInline: att.contentDisposition === "inline",
        });
      }
    }

    return attachments;
  }

  // 从 IMAP 同步邮件到数据库
  async syncEmails(options: SyncOptions = {}): Promise<{
    synced: number;
    skipped: number;
    errors: number;
  }> {
    const stats = { synced: 0, skipped: 0, errors: 0 };

    try {
      console.log("🔄 Starting email sync...");
      await this.emailSearcher.connect();

      if (options.folder && options.folder !== "INBOX") {
        console.log(`📂 Opening folder: ${options.folder}`);
        await this.emailSearcher.openFolder(options.folder);
      } else {
        await this.emailSearcher.openInbox();
      }

      // 构建搜索条件
      const criteria: any[] = [];

      if (options.since) {
        criteria.push(["SINCE", options.since]);
      } else {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        criteria.push(["SINCE", thirtyDaysAgo]);
      }

      if (options.before) {
        criteria.push(["BEFORE", options.before]);
      }

      if (options.from) {
        criteria.push(["FROM", options.from]);
      }

      if (options.to) {
        criteria.push(["TO", options.to]);
      }

      if (options.subject) {
        criteria.push(["SUBJECT", options.subject]);
      }

      if (options.unreadOnly) {
        criteria.push("UNSEEN");
      }

      if (options.starredOnly) {
        criteria.push("FLAGGED");
      }

      if (options.searchText) {
        criteria.push(["TEXT", options.searchText]);
      }

      if (options.sizeMin) {
        criteria.push(["LARGER", options.sizeMin]);
      }

      if (options.sizeMax) {
        criteria.push(["SMALLER", options.sizeMax]);
      }

      const uids = await this.emailSearcher.searchEmails(criteria);
      console.log(`📧 Found ${uids.length} emails to process`);

      const limit = options.limit || uids.length;
      const uidsToProcess = uids.slice(0, limit);

      for (let i = 0; i < uidsToProcess.length; i++) {
        const uid = uidsToProcess[i];

        try {
          const rawEmail = await this.emailSearcher.fetchEmail(uid);

          // 去重检查
          const existing = this.dbManager.getEmailByMessageId(
            rawEmail.messageId || `${uid}-${Date.now()}`
          );

          if (existing) {
            stats.skipped++;
            continue;
          }

          // 附件后置过滤
          if (options.hasAttachments !== undefined) {
            const hasAttachments = (rawEmail.attachments?.length || 0) > 0;
            if (options.hasAttachments !== hasAttachments) {
              stats.skipped++;
              continue;
            }
          }

          // 解析发件人
          const fromParsed = this.parseEmailAddress(rawEmail.from?.text || "");
          const fromAddress = fromParsed[0]?.address || "unknown@unknown.com";
          const fromName = fromParsed[0]?.name;

          // 提取收件人地址
          const toAddresses = this.extractAddressesText(rawEmail, 'to');
          const ccAddresses = this.extractAddressesText(rawEmail, 'cc');
          const bccAddresses = this.extractAddressesText(rawEmail, 'bcc');

          // 提取附件
          const attachments = this.extractAttachments(rawEmail);

          // 构建 EmailRecord（camelCase 字段）
          const emailRecord: EmailRecord = {
            messageId: rawEmail.messageId || `${uid}-${Date.now()}`,
            imapUid: uid,
            threadId: rawEmail.threadId ||
              (typeof rawEmail.references === 'string' ? rawEmail.references.split(" ")[0] :
               Array.isArray(rawEmail.references) ? rawEmail.references[0] : null),
            inReplyTo: rawEmail.inReplyTo,
            emailReferences: Array.isArray(rawEmail.references)
              ? rawEmail.references.join(" ")
              : rawEmail.references,
            dateSent: rawEmail.date ? rawEmail.date.toISOString() : new Date().toISOString(),
            subject: rawEmail.subject,
            fromAddress,
            fromName,
            toAddresses,
            ccAddresses,
            bccAddresses,
            replyTo: rawEmail.replyTo?.text,
            bodyText: rawEmail.text,
            bodyHtml: rawEmail.html,
            snippet: rawEmail.text?.substring(0, 200),
            isRead: options.markAsRead || false,
            isStarred: false,
            isImportant: false,
            isDraft: false,
            isSent: false,
            isTrash: false,
            isSpam: false,
            sizeBytes: 0,
            hasAttachments: (rawEmail.attachments?.length || 0) > 0,
            attachmentCount: rawEmail.attachments?.length || 0,
            folder: options.folder || "INBOX",
            rawHeaders: JSON.stringify(rawEmail.headers || {}),
          };

          // 写入数据库
          this.dbManager.upsertEmail(emailRecord, attachments);
          stats.synced++;

          // 触发 listener 事件
          if (this.listenersManager) {
            const emailForListener: Email = {
              messageId: emailRecord.messageId,
              from: emailRecord.fromAddress,
              to: toAddresses,
              subject: emailRecord.subject || '',
              body: emailRecord.bodyText || '',
              date: emailRecord.dateSent.toString(),
              isRead: emailRecord.isRead || false,
              hasAttachments: emailRecord.hasAttachments || false,
              labels: emailRecord.labels ? JSON.parse(typeof emailRecord.labels === 'string' ? emailRecord.labels : JSON.stringify(emailRecord.labels)) : undefined,
              uid: emailRecord.imapUid,
            };

            await this.listenersManager.checkEvent('email_received', emailForListener);
          }

          if ((i + 1) % 10 === 0) {
            console.log(`Progress: ${i + 1}/${uidsToProcess.length} emails processed`);
          }

        } catch (error) {
          console.error(`Error processing email ${uid}:`, error);
          stats.errors++;
        }
      }

    } catch (error) {
      console.error("Sync error:", error);
      throw error;
    } finally {
      this.emailSearcher.disconnect();
    }

    console.log(`✅ Sync complete: ${stats.synced} synced, ${stats.skipped} skipped, ${stats.errors} errors`);
    return stats;
  }

  // 仅同步上次同步后的新邮件
  async syncNewEmails(): Promise<{ synced: number; skipped: number; errors: number }> {
    const stats = this.dbManager.getStatistics();
    const since = stats?.newestEmail ? new Date(stats.newestEmail) : undefined;

    return this.syncEmails({ since });
  }

  // 处理 IDLE 监控期间到达的新邮件
  async handleIdleNewEmails(count: number, folder: string = "INBOX"): Promise<void> {
    console.log(`📬 Handling ${count} new email(s) from IDLE notification in folder: ${folder}`);

    try {
      const result = await this.syncEmails({
        folder,
        limit: count + 5,
        since: new Date(Date.now() - 60000),
      });

      console.log(`✅ IDLE sync complete: ${result.synced} new email(s) synced`);
    } catch (error) {
      console.error("❌ Error syncing emails from IDLE:", error);
    }
  }
}

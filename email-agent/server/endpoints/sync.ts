import { DatabaseManager } from "../../database/database-manager";
import { EmailSyncService } from "../../database/email-sync";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function createSyncEndpoints(dbManager: DatabaseManager, syncService: EmailSyncService) {
  async function handleSyncEndpoint(req: Request): Promise<Response> {
    try {
      const lastSyncResult = dbManager.getEmailByMessageId('__last_sync__');
      const stats = dbManager.getStatistics();

      const now = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);

      let syncSince: Date;
      if (stats?.newestEmail) {
        const lastSyncDate = new Date(stats.newestEmail);
        syncSince = lastSyncDate > sevenDaysAgo ? lastSyncDate : sevenDaysAgo;
      } else {
        syncSince = sevenDaysAgo;
      }

      // 通过同步元数据表检查是否最近已同步过
      // DatabaseManager 的 sync_metadata 表由 initializeDatabase 创建
      const recentEmails = dbManager.getRecentEmails(1, true);
      const emailCount = dbManager.getStatistics();

      if (emailCount?.totalEmails && emailCount.totalEmails > 0) {
        // 检查是否在一小时内同步过 — 通过统计数据判断
        const hourAgo = new Date();
        hourAgo.setHours(hourAgo.getHours() - 1);

        return new Response(JSON.stringify({
          message: 'Sync check - use sync/status for detailed info',
          emailCount: emailCount.totalEmails,
          newestEmail: emailCount.newestEmail,
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      console.log(`Starting sync for emails since ${syncSince.toISOString()}`);

      syncService.syncEmails({
        since: syncSince,
        limit: 30,
      }).then(syncResult => {
        console.log(`Sync completed: ${syncResult.synced} synced, ${syncResult.skipped} skipped, ${syncResult.errors} errors`);
      }).catch(error => {
        console.error('Background sync failed:', error);
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Sync started in background',
        syncStarted: new Date().toISOString(),
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    } catch (error) {
      console.error('Sync error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to sync emails',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  }

  async function handleSyncStatusEndpoint(req: Request): Promise<Response> {
    try {
      const stats = dbManager.getStatistics();

      const needsSync = !stats?.newestEmail ||
        stats.totalEmails === 0 ||
        (new Date().getTime() - new Date(stats.newestEmail).getTime()) > 3600000;

      return new Response(JSON.stringify({
        lastSync: stats?.newestEmail || null,
        emailCount: stats?.totalEmails || 0,
        needsSync,
        lastSyncStats: stats ? {
          synced: stats.totalEmails,
          unread: stats.unreadCount,
        } : null,
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    } catch (error) {
      console.error('Status check error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to check sync status'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  }

  return { handleSyncEndpoint, handleSyncStatusEndpoint };
}

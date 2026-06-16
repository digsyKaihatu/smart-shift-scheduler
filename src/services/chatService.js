import { formatValue } from '../utils/dateUtils'; 

/**
 * 環境変数の取得
 */
const WEBHOOKS = {
  SUBMISSION: (import.meta.env.VITE_CHAT_WEBHOOK_SUBMISSION || '').trim(),
  APPROVAL: (import.meta.env.VITE_CHAT_WEBHOOK_APPROVAL || '').trim(),
  REMAND: (import.meta.env.VITE_CHAT_WEBHOOK_REMAND || '').trim(),
  ABSENCE: (import.meta.env.VITE_CHAT_WEBHOOK_ABSENCE || '').trim(),
};

/**
 * 共通の送信処理
 */
async function postToChat(url, payload, type = 'notification') {
  if (!url) {
    // 【変更点】エラーを発生（throw）させず、警告を出して処理を完了（スキップ）させます
    console.warn(`[ChatService] Webhook URLが設定されていません: ${type}。通知をスキップして続行します。`);
    return false; 
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ChatService] Google Chat APIエラー (${type}): status ${response.status}`, errorText);
      throw new Error(`Google Chat送信失敗: ${response.status}`);
    }

    console.log(`[ChatService] 送信成功 (${type})`);
    return true;
  } catch (e) {
    console.error(`[ChatService] 通信エラー (${type}):`, e);
    throw e;
  }
}

// ・・・この下は元の chatService のエクスポート処理が続きます・・・
export const chatService = {
  // ... (省略)

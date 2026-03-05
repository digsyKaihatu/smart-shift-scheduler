/**
 * チャットツール(Google Chat, Slack等)への通知サービス
 */

const WEBHOOK_URL = import.meta.env.VITE_CHAT_WEBHOOK_URL || '';

export const chatService = {
  /**
   * 欠勤通知を送信する
   * @param {string} staffName スタッフ名
   */
  sendAbsence: async (staffName) => {
    if (!WEBHOOK_URL) {
      console.log(`[ChatService Mock] 欠勤通知: ${staffName}さんが欠勤です。`);
      return;
    }

    try {
      const message = {
        text: `【欠勤連絡】\n${staffName}さんが本日欠勤となります。\nシフトの調整をお願いします。`
      };

      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('チャット通知の送信に失敗しました:', error);
    }
  }
};

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
  },

  /**
   * シフト提出通知を送信する
   */
  sendSubmission: async (name, year, month, mentions) => {
    if (!WEBHOOK_URL) {
      console.log(`[ChatService Mock] 提出通知: ${name}さんが${year}年${month}月のシフトを提出しました。`);
      return;
    }
    try {
      const message = {
        text: `${mentions ? mentions + '\n' : ''}【シフト提出】\n${name}さんが${year}年${month}月のシフトを提出しました。`
      };
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('提出通知の送信に失敗しました:', error);
      throw error; // UI側でエラーを検知してロールバックさせるためにthrowする
    }
  },

  /**
   * シフト差戻通知を送信する
   */
  sendRemand: async (name, chatUserId) => {
    if (!WEBHOOK_URL) {
      console.log(`[ChatService Mock] 差戻通知: ${name}さんのシフトを差し戻しました。`);
      return;
    }
    try {
      const mention = chatUserId ? `<users/${chatUserId}> ` : '';
      const message = {
        text: `${mention}【シフト差戻】\n${name}さんのシフトが差し戻されました。内容を確認し、再提出をお願いします。`
      };
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('差戻通知の送信に失敗しました:', error);
      throw error;
    }
  },

  /**
   * シフト承認通知を送信する
   */
  sendApproval: async (staff, year, month, patternText, irregularText, remarks) => {
    if (!WEBHOOK_URL) {
      console.log(`[ChatService Mock] 承認通知: ${staff.name}さんの${year}年${month}月のシフトを承認しました。`);
      return;
    }
    try {
      const mention = staff.chatUserId ? `<users/${staff.chatUserId}> ` : '';
      let text = `${mention}【シフト承認】\n${staff.name}さんの${year}年${month}月のシフトが承認されました。\n\n`;
      text += `[基本パターン]\n${patternText}\n`;
      if (irregularText) text += `\n[イレギュラー設定]\n${irregularText}\n`;
      if (remarks) text += `\n[管理者コメント]\n${remarks}`;

      const message = { text };
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('承認通知の送信に失敗しました:', error);
      throw error;
    }
  },

  /**
   * 承認後の変更確定通知を送信する
   */
  sendChangeAfterApproval: async (name, year, month, dateSummary, changeDetails, mentions) => {
    if (!WEBHOOK_URL) {
      console.log(`[ChatService Mock] 変更通知: ${name}さんの${year}年${month}月のシフトが変更されました。`);
      return;
    }
    try {
      let text = `${mentions ? mentions + '\n' : ''}【シフト変更（承認後）】\n${name}さんの${year}年${month}月のシフト（対象日: ${dateSummary}）が変更・確定されました。\n\n[変更内容]\n${changeDetails}`;
      const message = { text };
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('変更通知の送信に失敗しました:', error);
      throw error;
    }
  }
};

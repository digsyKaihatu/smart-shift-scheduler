import { formatValue } from '../utils/dateUtils'; 

/**
 * 環境変数の取得
 * 各通知種別ごとに Cloudflare Pages 等で設定された個別の Webhook URL を使用します。
 */
const WEBHOOKS = {
  SUBMISSION: (import.meta.env.VITE_CHAT_WEBHOOK_SUBMISSION || '').trim(),
  APPROVAL: (import.meta.env.VITE_CHAT_WEBHOOK_APPROVAL || '').trim(),
  REMAND: (import.meta.env.VITE_CHAT_WEBHOOK_REMAND || '').trim(),
  ABSENCE: (import.meta.env.VITE_CHAT_WEBHOOK_ABSENCE || '').trim(),
};

/**
 * 共通の送信処理
 * エラーが発生した場合は throw し、UI側のロールバック処理を発火させます。
 * （※Webhook URLが未設定の場合はスキップし、エラー扱いにしないように修正済み）
 */
async function postToChat(url, payload, type = 'notification') {
  if (!url) {
    // 【修正点】エラーを発生させず、警告を出して処理を完了（スキップ）させます
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

export const chatService = {
  /**
   * シフト提出通知
   */
  async sendSubmission(name, year, month, mentions) {
    const payload = {
      text: `${mentions ? mentions + '\n' : ''}【シフト提出】\n${name}さんが ${year}年${month}月 のシフトを提出しました。確認をお願いします。`
    };
    return await postToChat(WEBHOOKS.SUBMISSION, payload, 'Submission');
  },

  /**
   * シフト承認通知 (カード形式)
   */
  async sendApproval(staff, year, month, patternSummary, irregularities, remarks) {
    const mention = staff.chatUserId ? `<users/${staff.chatUserId}>` : '';
    const title = `${year}年${month}月 シフト承認のお知らせ`;
    const subtitle = `${staff.name} さん`;

    const payload = {
      cardsV2: [{
        cardId: "approval-card",
        card: {
          header: {
            title: title,
            subtitle: subtitle,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/check_circle_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "基本シフトパターン",
              widgets: [{ textParagraph: { text: patternSummary } }]
            },
            {
              header: "特記事項 (パターンと異なる日)",
              widgets: [{ textParagraph: { text: irregularities || "なし" } }]
            },
            {
              header: "管理者コメント",
              widgets: [{ textParagraph: { text: remarks || "なし" } }]
            },
            {
              widgets: [{
                textParagraph: {
                  text: `${mention} \n上記内容でシフトが確定しました。ご確認ください。`
                }
              }]
            }
          ]
        }
      }]
    };

    return await postToChat(WEBHOOKS.APPROVAL, payload, 'Approval');
  },

  /**
   * シフト差戻通知
   */
  async sendRemand(name, chatUserId) {
    const mention = chatUserId ? `<users/${chatUserId}> ` : '';
    const payload = {
      text: `${mention}【シフト差戻】\n${name}さんのシフトが差し戻されました。内容を確認し、再提出をお願いします。`
    };
    return await postToChat(WEBHOOKS.REMAND, payload, 'Remand');
  },

  /**
   * 承認後の変更確定通知 (一括送信時)
   */
  async sendChangeAfterApproval(name, year, month, dateSummary, changeDetails, mentions) {
    const title = `${year}年${month}月 シフト変更のお知らせ`;
    const subtitle = `${name} さん`;

    const payload = {
      cardsV2: [{
        cardId: `bulk-change-${Date.now()}`,
        card: {
          header: {
            title: title,
            subtitle: subtitle,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/edit_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "変更対象日",
              widgets: [{ textParagraph: { text: dateSummary } }]
            },
            {
              header: "変更内容詳細",
              widgets: [{ textParagraph: { text: changeDetails } }]
            },
            {
              widgets: [{
                textParagraph: {
                  text: `${mentions ? mentions + '\n' : ''}承認済みのシフトに変更・確定がありました。内容をご確認ください。`
                }
              }]
            }
          ]
        }
      }]
    };

    // 承認済みデータの修正なので、APPROVAL用のWebhookを使用します
    return await postToChat(WEBHOOKS.APPROVAL, payload, 'ChangeAfterApproval');
  },

  /**
   * 欠勤通知
   */
  async sendAbsence(name) {
    const payload = {
      text: `【欠勤連絡】\n本日は ${name} さんが欠勤となります。業務調整をお願いします。`
    };
    return await postToChat(WEBHOOKS.ABSENCE, payload, 'Absence');
  }
};

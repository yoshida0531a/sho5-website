// AI要約機能付きNewsroom更新スクリプト
const fetch = require('node-fetch');
const fs = require('fs').promises;

// 設定
const CONFIG = {
  // 無料で使えるHugging Faceモデル
  HUGGINGFACE_MODELS: {
    primary: "microsoft/DialoGPT-small",
    fallback: "t5-small"
  },
  
  // 監視対象サイト
  MONITORED_SITES: [
    "https://www.nihon-u.ac.jp/sports/news/",
    "https://sports.yahoo.co.jp/official/detail/",
    "https://www.nikkansports.com/baseball/news/"
  ],
  
  // 出力ファイル
  OUTPUT_FILE: "ai_processed_news.json",
  
  // 要約設定
  SUMMARY_CONFIG: {
    maxLength: 200,
    minLength: 50,
    targetLanguage: "ja"
  }
};

class AINewsProcessor {
  constructor(huggingfaceApiKey) {
    this.apiKey = huggingfaceApiKey;
    this.processedNews = [];
  }

  // メイン処理関数
  async processNews() {
    console.log("🤖 AI Newsroom処理を開始します...");
    
    try {
      // 既存のニュースデータを読み込み
      const existingNews = await this.loadExistingNews();
      
      // 各サイトをチェック
      for (const site of CONFIG.MONITORED_SITES) {
        console.log(`📰 サイトをチェック中: ${site}`);
        const newArticles = await this.checkSiteForUpdates(site);
        
        // 新しい記事があれば処理
        for (const article of newArticles) {
          if (!this.isDuplicate(article, existingNews)) {
            const processedArticle = await this.processArticleWithAI(article);
            this.processedNews.push(processedArticle);
          }
        }
      }
      
      // 結果を保存
      if (this.processedNews.length > 0) {
        await this.saveProcessedNews();
        console.log(`✅ ${this.processedNews.length}件の新しい記事を処理しました`);
      } else {
        console.log("📰 新しい記事はありませんでした");
      }
      
    } catch (error) {
      console.error("❌ 処理中にエラーが発生:", error);
    }
  }

  // 既存ニュースデータの読み込み
  async loadExistingNews() {
    try {
      const data = await fs.readFile(CONFIG.OUTPUT_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log("📄 既存データファイルなし、新規作成します");
      return [];
    }
  }

  // サイト更新チェック
  async checkSiteForUpdates(siteUrl) {
    // 簡単な実装例（実際は各サイトのHTML構造に合わせて調整が必要）
    try {
      const response = await fetch(siteUrl);
      const html = await response.text();
      
      // 記事リンクを抽出（正規表現による簡易抽出）
      const articleLinks = html.match(/href="([^"]*\/\d{4}\/\d{2}\/\d{2}\/[^"]*)"[^>]*>/g) || [];
      
      const articles = [];
      for (const link of articleLinks.slice(0, 5)) { // 最新5件のみ
        const url = link.match(/href="([^"]*)"/)[1];
        const fullUrl = url.startsWith('http') ? url : new URL(url, siteUrl).href;
        
        const articleData = await this.extractArticleContent(fullUrl);
        if (articleData) {
          articles.push(articleData);
        }
      }
      
      return articles;
    } catch (error) {
      console.error(`サイト取得エラー ${siteUrl}:`, error);
      return [];
    }
  }

  // 記事コンテンツ抽出
  async extractArticleContent(url) {
    try {
      const response = await fetch(url);
      const html = await response.text();
      
      // 簡易的なタイトル・本文抽出
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : "タイトルなし";
      
      // 本文抽出（p要素から）
      const contentMatches = html.match(/<p[^>]*>([^<]+)<\/p>/g) || [];
      const content = contentMatches
        .map(p => p.replace(/<[^>]*>/g, ''))
        .join(' ')
        .substring(0, 1000);
      
      // 画像URL抽出
      const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*>/);
      const imageUrl = imgMatch ? imgMatch[1] : null;
      
      return {
        title,
        url,
        content,
        imageUrl,
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`記事抽出エラー ${url}:`, error);
      return null;
    }
  }

  // 重複チェック
  isDuplicate(article, existingNews) {
    return existingNews.some(existing => 
      existing.url === article.url || 
      this.calculateSimilarity(existing.title, article.title) > 0.8
    );
  }

  // 類似度計算（簡易版）
  calculateSimilarity(str1, str2) {
    const words1 = str1.toLowerCase().split(' ');
    const words2 = str2.toLowerCase().split(' ');
    const intersection = words1.filter(word => words2.includes(word));
    return intersection.length / Math.max(words1.length, words2.length);
  }

  // AI処理で記事を要約・再編
  async processArticleWithAI(article) {
    console.log(`🤖 AI処理中: ${article.title}`);
    
    try {
      // AI要約を生成
      const summary = await this.generateAISummary(article.content);
      
      // タイトルを自然に調整
      const adjustedTitle = await this.adjustTitleWithAI(article.title);
      
      return {
        ...article,
        title: adjustedTitle || article.title,
        summary,
        originalContent: article.content,
        processedAt: new Date().toISOString(),
        pubDate: new Date().toISOString() // 現在時刻を公開日とする
      };
    } catch (error) {
      console.error("AI処理エラー:", error);
      
      // AI処理失敗時はフォールバック処理
      return {
        ...article,
        summary: this.createSimpleSummary(article.content),
        processedAt: new Date().toISOString(),
        pubDate: new Date().toISOString()
      };
    }
  }

  // Hugging Face APIによるAI要約
  async generateAISummary(content) {
    if (!this.apiKey) {
      console.warn("⚠️ Hugging Face APIキーなし、フォールバック処理");
      return this.createSimpleSummary(content);
    }

    try {
      // 日本語テキストの場合は独自処理
      if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(content)) {
        return this.createJapaneseSummary(content);
      }

      // 英語の場合はHugging Face API
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${CONFIG.HUGGINGFACE_MODELS.primary}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: content.substring(0, 1000), // API制限対応
            parameters: {
              max_length: CONFIG.SUMMARY_CONFIG.maxLength,
              min_length: CONFIG.SUMMARY_CONFIG.minLength,
              do_sample: false
            }
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result && result[0] && result[0].summary_text) {
          return result[0].summary_text;
        }
      } else {
        console.error(`Hugging Face APIエラー: ${response.status}`);
      }
    } catch (error) {
      console.error("AI要約エラー:", error);
    }

    // フォールバック
    return this.createSimpleSummary(content);
  }

  // 日本語専用要約機能
  createJapaneseSummary(content) {
    // 重要そうな文を抽出
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 10);
    
    // キーワード重要度による文選択
    const keywords = ['日本大', '谷端', '野球', '試合', '勝利', '本塁打', '東都'];
    const scoredSentences = sentences.map(sentence => {
      const score = keywords.reduce((acc, keyword) => {
        return acc + (sentence.includes(keyword) ? 1 : 0);
      }, 0);
      return { sentence, score };
    });
    
    // スコアの高い順に2-3文選択
    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.sentence);
    
    return topSentences.join('。') + '。';
  }

  // シンプル要約（フォールバック）
  createSimpleSummary(content) {
    const words = content.split(' ').slice(0, 30);
    return words.join(' ') + (words.length >= 30 ? '...' : '');
  }

  // タイトル調整
  async adjustTitleWithAI(title) {
    // 転記感を減らすための簡易調整
    const adjustments = {
      '【': '',
      '】': '',
      '〈': '',
      '〉': '',
      '速報': '',
      '最新': ''
    };
    
    let adjusted = title;
    for (const [old, replacement] of Object.entries(adjustments)) {
      adjusted = adjusted.replace(new RegExp(old, 'g'), replacement);
    }
    
    return adjusted.trim();
  }

  // 処理済みニュースの保存
  async saveProcessedNews() {
    try {
      const existingNews = await this.loadExistingNews();
      const allNews = [...existingNews, ...this.processedNews];
      
      // 古い記事を削除（30日以上前）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentNews = allNews.filter(article => {
        const articleDate = new Date(article.pubDate);
        return articleDate > thirtyDaysAgo;
      });
      
      await fs.writeFile(CONFIG.OUTPUT_FILE, JSON.stringify(recentNews, null, 2));
      console.log(`💾 ${recentNews.length}件の記事を保存しました`);
    } catch (error) {
      console.error("保存エラー:", error);
    }
  }
}

// 使用例
async function main() {
  const processor = new AINewsProcessor(process.env.HUGGINGFACE_API_KEY);
  await processor.processNews();
}

// 直接実行時の処理
if (require.main === module) {
  main().catch(console.error);
}

module.exports = AINewsProcessor;
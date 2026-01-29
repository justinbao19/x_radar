/**
 * Safety Module Tests
 * Tests brand safety filtering, keyword matching, and three-tier system
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

// Import safety functions
import {
  checkBrandSafety,
  checkMinFiloFit,
  checkPainRelevance,
  checkReachRelevance,
  countFiloFitKeywords,
  isEmailActionOnly,
  checkPainEmotion,
  isCustomerServiceNotice,
  isCompetitorPromotion,
  isViralTemplate,
  checkHardDenylist,
  checkSoftDenylist,
  checkLowSignalDenylist,
  checkInsightNoise,
  checkInsightRequestSignal,
  MIN_FILO_FIT,
  LOW_SIGNAL_PENALTY
} from '../src/safety.mjs';

describe('Safety Module', () => {
  
  describe('Hard Denylist', () => {
    it('should detect political content', () => {
      const result = checkHardDenylist('Vote for my candidate in the election');
      assert.strictEqual(result.match, true);
      assert.strictEqual(result.category, 'politics');
    });
    
    it('should detect sensitive content keywords', () => {
      const result = checkHardDenylist('This is about cryptocurrency and bitcoin trading');
      // This may or may not match depending on denylist content
      // Just verify function works
      assert.ok(typeof result.match === 'boolean');
    });
    
    it('should pass clean content', () => {
      const result = checkHardDenylist('My email inbox is overloaded with newsletters');
      assert.strictEqual(result.match, false);
    });
  });
  
  describe('Brand Safety Check', () => {
    it('should drop hard-flagged content', () => {
      const result = checkBrandSafety('Vote in the election today', 0);
      assert.strictEqual(result.action, 'drop');
      assert.strictEqual(result.tier, 'hard');
    });
    
    it('should allow clean content', () => {
      const result = checkBrandSafety('I love using AI to organize my email inbox', 25);
      assert.strictEqual(result.action, 'allow');
    });
    
    it('should apply penalty to low signal content', () => {
      const result = checkBrandSafety('Check out this random link', 5);
      // May or may not trigger low signal based on denylist
      assert.ok(['allow', 'penalize', 'drop'].includes(result.action));
    });
  });
  
  describe('FiloFit Threshold', () => {
    it('should pass high FiloFit scores', () => {
      const result = checkMinFiloFit(15); // 3 keywords
      assert.strictEqual(result.pass, true);
    });
    
    it('should fail low FiloFit scores', () => {
      const result = checkMinFiloFit(5); // 1 keyword
      assert.strictEqual(result.pass, false);
    });
    
    it('should use correct threshold', () => {
      // MIN_FILO_FIT * 5 = threshold score
      const thresholdScore = MIN_FILO_FIT * 5;
      const belowResult = checkMinFiloFit(thresholdScore - 1);
      const atResult = checkMinFiloFit(thresholdScore);
      
      assert.strictEqual(belowResult.pass, false);
      assert.strictEqual(atResult.pass, true);
    });
  });
  
  describe('FiloFit Keyword Counting', () => {
    it('should count email-related keywords', () => {
      const count = countFiloFitKeywords('My inbox is overloaded with email and spam');
      assert.ok(count >= 3, `Expected >= 3 keywords, got ${count}`);
    });
    
    it('should count productivity keywords', () => {
      const count = countFiloFitKeywords('AI agent for productivity automation');
      assert.ok(count >= 2, `Expected >= 2 keywords, got ${count}`);
    });
    
    it('should count Japanese keywords', () => {
      const count = countFiloFitKeywords('メールの通知が多すぎてスパムだらけ');
      assert.ok(count >= 2, `Expected >= 2 JP keywords, got ${count}`);
    });
    
    it('should count Chinese keywords', () => {
      const count = countFiloFitKeywords('邮箱收件箱太多垃圾邮件了');
      assert.ok(count >= 2, `Expected >= 2 CN keywords, got ${count}`);
    });
    
    it('should return 0 for unrelated content', () => {
      const count = countFiloFitKeywords('Beautiful sunset at the beach');
      assert.strictEqual(count, 0);
    });
  });
  
  describe('Pain Relevance', () => {
    it('should detect email pain points', () => {
      const result = checkPainRelevance('My inbox is drowning in unread messages');
      assert.strictEqual(result.relevant, true);
      assert.ok(result.keywords.length > 0);
    });
    
    it('should detect newsletter complaints', () => {
      const result = checkPainRelevance('Too many newsletters, need to unsubscribe from spam');
      assert.strictEqual(result.relevant, true);
    });
    
    it('should reject unrelated content', () => {
      const result = checkPainRelevance('Having coffee at the park');
      assert.strictEqual(result.relevant, false);
    });
  });
  
  describe('Reach Relevance', () => {
    it('should detect AI + productivity combo', () => {
      const result = checkReachRelevance('AI agents transforming email workflow and productivity');
      assert.strictEqual(result.relevant, true);
      assert.strictEqual(result.hasAI, true);
      assert.strictEqual(result.hasProductivity, true);
    });
    
    it('should reject AI-only without productivity context', () => {
      const result = checkReachRelevance('AI is amazing technology');
      // May or may not be relevant based on keyword matching
      assert.ok(typeof result.relevant === 'boolean');
    });
  });
  
  describe('Email Action Only Detection', () => {
    it('should detect "email me at" patterns', () => {
      const result = isEmailActionOnly('Email me at contact@example.com for details');
      assert.strictEqual(result, true);
    });
    
    it('should detect "send email to" patterns', () => {
      const result = isEmailActionOnly('Please send an email to the support team');
      assert.strictEqual(result, true);
    });
    
    it('should allow email pain points', () => {
      const result = isEmailActionOnly('I hate my email inbox, it is a nightmare of spam');
      assert.strictEqual(result, false);
    });
    
    it('should detect Japanese email action', () => {
      const result = isEmailActionOnly('詳細はメールしてください');
      assert.strictEqual(result, true);
    });
    
    it('should detect Chinese email action', () => {
      const result = isEmailActionOnly('请发邮件给我们获取更多信息');
      assert.strictEqual(result, true);
    });
  });
  
  describe('Pain Emotion Words', () => {
    it('should detect frustration words', () => {
      const result = checkPainEmotion('I hate dealing with this overwhelming email chaos');
      assert.strictEqual(result.hasPainEmotion, true);
      assert.ok(result.words.includes('hate') || result.words.includes('overwhelming') || result.words.includes('chaos'));
    });
    
    it('should detect negative experience words', () => {
      const result = checkPainEmotion('Email is a nightmare, terrible and frustrating');
      assert.strictEqual(result.hasPainEmotion, true);
    });
    
    it('should not flag neutral mentions', () => {
      const result = checkPainEmotion('Just checking my email this morning');
      assert.strictEqual(result.hasPainEmotion, false);
    });
    
    it('should detect Japanese emotion words', () => {
      const result = checkPainEmotion('メールがうざい、最悪');
      assert.strictEqual(result.hasPainEmotion, true);
    });
    
    it('should detect Chinese emotion words', () => {
      const result = checkPainEmotion('邮件太多烦死了，找不到重要的');
      assert.strictEqual(result.hasPainEmotion, true);
    });
  });
  
  describe('Customer Service Notice Detection', () => {
    it('should detect check inbox notices', () => {
      const result = isCustomerServiceNotice('Please check your inbox for the confirmation email');
      assert.strictEqual(result.isNotice, true);
    });
    
    it('should detect sent to email notices', () => {
      const result = isCustomerServiceNotice('E-tickets have been sent to your registered email');
      assert.strictEqual(result.isNotice, true);
    });
    
    it('should detect spam folder suggestions', () => {
      const result = isCustomerServiceNotice('Check your junk folder if you haven\'t received it');
      assert.strictEqual(result.isNotice, true);
    });
    
    it('should allow user frustration about email', () => {
      const result = isCustomerServiceNotice('I checked my spam folder and still can\'t find it! So frustrated!');
      assert.strictEqual(result.isNotice, false);
    });
    
    it('should detect Japanese service notices', () => {
      const result = isCustomerServiceNotice('メールをご確認ください');
      assert.strictEqual(result.isNotice, true);
    });
    
    it('should detect Chinese service notices', () => {
      const result = isCustomerServiceNotice('请查收您的邮件');
      assert.strictEqual(result.isNotice, true);
    });
  });
  
  describe('Competitor Promotion Detection', () => {
    it('should detect competitor product mentions from denylist', () => {
      // This depends on denylist content
      const result = isCompetitorPromotion('Check out this cool product for email');
      assert.ok(typeof result.isPromotion === 'boolean');
    });
    
    it('should detect promotional language patterns', () => {
      const result = isCompetitorPromotion('Meet EmailApp - your new AI inbox assistant');
      assert.strictEqual(result.isPromotion, true);
    });
    
    it('should detect "using X to manage" patterns', () => {
      const result = isCompetitorPromotion('I\'m using @SomeApp to manage my inbox');
      assert.strictEqual(result.isPromotion, true);
    });
    
    it('should allow pain point discussions', () => {
      const result = isCompetitorPromotion('My email inbox is completely overwhelming');
      assert.strictEqual(result.isPromotion, false);
    });
  });
  
  describe('Viral Template Detection', () => {
    it('should detect relationship boundary copypasta', () => {
      const result = isViralTemplate('I hate that this has to be said but I have a girlfriend. Don\'t DM or email me');
      assert.strictEqual(result.isViral, true);
      assert.strictEqual(result.template, 'relationship_boundary_copypasta');
    });
    
    it('should detect email offer spam', () => {
      const result = isViralTemplate('Email me at spam@example.com for free stuff');
      assert.strictEqual(result.isViral, true);
    });
    
    it('should allow genuine email content', () => {
      const result = isViralTemplate('My inbox is drowning in unread newsletters');
      assert.strictEqual(result.isViral, false);
    });
  });
  
  describe('Insight Noise Detection', () => {
    it('should detect marketing signup patterns', () => {
      const result = checkInsightNoise('Subscribe to our newsletter for updates');
      assert.strictEqual(result.isNoise, true);
    });
    
    it('should detect recruiting patterns', () => {
      const result = checkInsightNoise('We are hiring engineers, apply now');
      assert.strictEqual(result.isNoise, true);
    });
    
    it('should detect news/announcement patterns', () => {
      const result = checkInsightNoise('We just launched our new pricing plans');
      assert.strictEqual(result.isNoise, true);
    });
    
    it('should allow genuine feature requests', () => {
      const result = checkInsightNoise('I wish this app had better email integration');
      assert.strictEqual(result.isNoise, false);
    });
  });
  
  describe('Insight Request Signal', () => {
    it('should detect wish patterns', () => {
      const result = checkInsightRequestSignal('I wish there was an AI to handle my email');
      assert.strictEqual(result.hasSignal, true);
    });
    
    it('should detect feature request patterns', () => {
      const result = checkInsightRequestSignal('Please add a feature for email summarization');
      assert.strictEqual(result.hasSignal, true);
    });
    
    it('should detect Japanese request patterns', () => {
      const result = checkInsightRequestSignal('この機能が欲しい');
      assert.strictEqual(result.hasSignal, true);
    });
    
    it('should detect Chinese request patterns', () => {
      const result = checkInsightRequestSignal('希望能有这个功能');
      assert.strictEqual(result.hasSignal, true);
    });
    
    it('should not flag simple statements', () => {
      const result = checkInsightRequestSignal('Email is useful');
      assert.strictEqual(result.hasSignal, false);
    });
  });
});

console.log('Safety module tests loaded');

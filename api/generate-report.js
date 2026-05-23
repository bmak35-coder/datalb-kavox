/**
 * Vercel Serverless Function: /api/generate-report
 * Calls Claude API server-side. API key never exposed to frontend.
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not configured. Add it in Vercel → Settings → Environment Variables.',
    })
  }

  let snapshot
  try {
    snapshot = req.body?.snapshot
    if (!snapshot) throw new Error('Missing snapshot in request body')
  } catch (err) {
    return res.status(400).json({ error: `Invalid request: ${err.message}` })
  }

  const { identity, metrics, behaviour, sessions, rules, broker, failure } = snapshot
  const fN = (v, fb = '—') => v == null ? fb : String(v)

  const prompt = `You are generating an institutional-grade trader diagnosis report for a professional financial dashboard. Use ONLY the data provided below. Be concise, professional, and direct.

DATA SNAPSHOT:
TRADER IDENTITY
  Type: ${fN(identity.traderType)}
  Risk Profile: ${fN(identity.riskProfile)}
  Behaviour Profile: ${fN(identity.behaviourProfile)}
  Account Grade: ${fN(identity.accountGrade)} (diagnostic score ${fN(identity.diagScore)}/100)
  Confidence: ${fN(identity.confidence)}%

KEY METRICS (${fN(metrics.totalTrades)} closed trades, ${fN(metrics.calDays)} calendar days)
  Net Profit: ${fN(metrics.netProfit)}
  Win Rate: ${fN(metrics.winRate)} | Profit Factor: ${fN(metrics.profitFactor)}
  Avg Win: ${fN(metrics.avgWin)} | Avg Loss: ${fN(metrics.avgLoss)}
  Max Drawdown: ${fN(metrics.maxRelDD)} | Recovery Factor: ${fN(metrics.recoveryFactor)}
  Max Loss Streak: ${fN(metrics.maxLossStreak)}

BEHAVIOUR
  Martingale Confidence: ${fN(behaviour.martingaleConf)}/100
  Lot Escalation Rate: ${fN(behaviour.escalationRate)} of losses
  Revenge Trading: ${behaviour.revengeDetected ? 'CONFIRMED' : 'Not detected'}
  Post-Loss Win Rate: ${fN(behaviour.postLossWinRate)} vs ${fN(behaviour.baselineWinRate)} baseline
  Hold Ratio W/L: ${fN(behaviour.holdRatio)}
  Top Symbol: ${fN(behaviour.topSymbol)} (${fN(behaviour.topSymbolPct)} of trades)
  Frequency Score: ${fN(behaviour.frequencyScore)}/100

SESSIONS
  Best: ${sessions.bestSession ? `${sessions.bestSession.key} — PF ${sessions.bestSession.pf}, WR ${sessions.bestSession.wr}, Net ${sessions.bestSession.netPL}` : 'Insufficient data'}
  Worst: ${sessions.worstSession ? `${sessions.worstSession.key} — PF ${sessions.worstSession.pf}, WR ${sessions.worstSession.wr}, Net ${sessions.worstSession.netPL}` : 'Insufficient data'}

RULES ENGINE: ${fN(rules.triggeredCount)} triggered — ${fN(rules.criticalCount)} Critical, ${fN(rules.highCount)} High
Top Rules: ${(rules.topRules || []).slice(0, 3).join('; ') || 'None'}

BROKER ROUTING: ${fN(broker.recommendedRouting)} (confidence ${fN(broker.routingConfidence)}%)
Risk To Broker: ${fN(broker.riskToBroker)}/100

FAILURE PROBABILITY
  Survival Score: ${fN(failure.survivalScore)}/100
  30-Day: ${fN(failure.p30)}% | 90-Day: ${fN(failure.p90)}% | 180-Day: ${fN(failure.p180)}%
  Primary Driver: ${fN(failure.primaryDriver)}
  Expected Lifespan: ${fN(failure.expectedTTF)}

KEY STRENGTH: ${fN(identity.mainStrength)}
KEY WEAKNESS: ${fN(identity.mainWeakness)}
RECOMMENDED FOCUS: ${fN(identity.recommendedFocus)}

Generate a structured JSON report with exactly these 11 sections. Each section has a "title" (string) and "content" (2-5 concise professional sentences using only the data above).

Return ONLY valid JSON, no markdown fences:
{"executiveSummary":{"title":"Executive Summary","content":"..."},"traderIdentity":{"title":"Trader Identity","content":"..."},"keyStrengths":{"title":"Key Strengths","content":"..."},"keyWeaknesses":{"title":"Key Weaknesses","content":"..."},"riskAssessment":{"title":"Risk Assessment","content":"..."},"behaviourAnalysis":{"title":"Behaviour Analysis","content":"..."},"sessionAnalysis":{"title":"Session Analysis","content":"..."},"brokerRoutingAssessment":{"title":"Broker Routing Assessment","content":"..."},"failureProbabilityAnalysis":{"title":"Failure Probability Analysis","content":"..."},"actionPlan":{"title":"Action Plan","content":"..."},"expectedImprovementScenario":{"title":"Expected Improvement Scenario","content":"..."}}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Anthropic API error ${resp.status}: ${errText.slice(0, 300)}`)
    }

    const data = await resp.json()
    const raw = (data.content || []).map(c => c.text || '').join('').trim()
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const report = JSON.parse(clean)

    return res.status(200).json({ report })

  } catch (err) {
    console.error('generate-report error:', err.message)
    return res.status(500).json({ error: `Report generation failed: ${err.message}` })
  }
}

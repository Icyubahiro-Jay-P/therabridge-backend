import mongoose from "mongoose"
import "dotenv/config"
import { connectDB } from "./db/connectDB.js"
import { PsychoedModule } from "./models/psychoedModule.model.js"
import logger from "./utils/logger.js"

const modules = [
  {
    title: "CBT Basics: Understanding Your Thoughts",
    description:
      "Learn the fundamentals of Cognitive Behavioral Therapy, how thoughts, feelings, and behaviors connect, and how to challenge unhelpful thinking patterns.",
    category: "cbt",
    order: 1,
    steps: [
      {
        title: "What Is CBT?",
        content: `Cognitive Behavioral Therapy (CBT) is one of the most researched and effective forms of therapy. At its core, CBT is based on a simple but powerful idea: **our thoughts, feelings, and behaviors are all connected**.

When we change one element of this triangle, the others shift too. Unlike some approaches that focus mainly on the past, CBT is practical and present-focused, it gives you tools you can use right away.

CBT doesn't mean "positive thinking." It means **accurate thinking**, learning to see situations as they really are, rather than through the distortion of stress or low mood.`,
        duration: 5,
      },
      {
        title: "The Thought–Feeling–Behavior Cycle",
        content: `Imagine this scenario: A friend doesn't reply to your text for several hours.

**Thought:** "They're ignoring me. I must have said something wrong."
**Feeling:** Anxiety, sadness, rejection.
**Behavior:** You stop texting them. You withdraw. You feel worse.

Now consider a different thought about the same situation:

**Thought:** "They're probably busy. I'll hear back when they can."
**Feeling:** Mild curiosity, patience.
**Behavior:** You go about your day normally.

The situation didn't change, only the **interpretation** changed. And that changed everything else.

This cycle runs constantly, often below our awareness. CBT teaches you to **catch** these automatic thoughts and examine them critically.`,
        duration: 7,
      },
      {
        title: "Common Thinking Traps",
        content: `Our brains evolved to detect threats quickly, but that speed comes at a cost. We develop habitual distortions that feel true but aren't accurate. Common ones include:

**All-or-Nothing Thinking:** "If I'm not perfect, I'm a failure." Things are rarely 0% or 100%.

**Catastrophizing:** "I made a mistake at work, I'm going to get fired." One error rarely means the worst outcome.

**Mind Reading:** "Everyone thinks I'm boring." You can't actually know what others think.

**Emotional Reasoning:** "I feel stupid, so I must be stupid." Feelings are real, but they're not always facts.

**Overgeneralizing:** "This always happens to me." One event becomes a pattern.

**Discounting the Positive:** "That compliment doesn't count, they were just being nice."

Recognizing these patterns is the first step. You don't have to believe every thought you have.`,
        duration: 7,
      },
      {
        title: "The Thought Record",
        content: `A thought record is CBT's core tool. It slows down the automatic cycle and lets you examine it with curiosity instead of reactivity.

**Step 1, Situation:** What actually happened? (Just the facts.)
**Step 2, Emotion:** What did you feel? Rate intensity 0–100.
**Step 3, Automatic Thought:** What went through your mind?
**Step 4, Evidence For:** What supports this thought?
**Step 5, Evidence Against:** What contradicts it?
**Step 6, Balanced Thought:** What's a more accurate perspective?
**Step 7, Re-rate Emotion:** How do you feel now? 0–100.

You don't need to fill this out perfectly. Even pausing to ask "What's the evidence?" can shift a thought from feeling like a fact to feeling like a hypothesis, because that's what it is.`,
        duration: 8,
      },
      {
        title: "Putting It Into Practice",
        content: `CBT is a skill, and like any skill, it gets stronger with practice. Here's how to start:

1. **Notice your emotional shifts.** When you feel a sudden dip (or spike), that's a signal a thought just fired.
2. **Name the feeling.** "I'm feeling anxious" is more useful than just feeling bad.
3. **Ask: "What was I just thinking?"** Write it down if you can.
4. **Check it.** Is this thought a fact or an interpretation? What would I say to a friend in this situation?
5. **Reframe.** Not to force positivity, but to find accuracy.

Start with one thought per day. Over time, this process becomes more automatic, not because the thoughts stop, but because you stop believing all of them unquestioningly.

Remember: The goal isn't to never have negative thoughts. The goal is to **respond** to them instead of **reacting**.`,
        duration: 6,
      },
    ],
  },
  {
    title: "Understanding Anxiety",
    description:
      "Explore what anxiety actually is, why it exists, and evidence-based strategies to manage it when it becomes overwhelming.",
    category: "anxiety",
    order: 1,
    steps: [
      {
        title: "What Anxiety Really Is",
        content: `Anxiety is not a malfunction. It's your brain's **threat detection system** doing exactly what it was designed to do, alerting you to potential danger so you can prepare.

The problem isn't that anxiety exists. The problem is when it fires in the absence of real danger, or when the intensity doesn't match the actual threat. That's when anxiety shifts from helpful to harmful.

Anxiety lives in the **amygdala**, a small structure deep in the brain that processes fear. It's faster than your rational brain (the prefrontal cortex), which is why anxious thoughts can feel overwhelming before you have a chance to think them through.

Understanding this biology isn't just academic. It means anxiety is **not a character flaw**. It's a system that's working too hard.`,
        duration: 5,
      },
      {
        title: "The Fight-Flight-Freeze Response",
        content: `When your brain detects a threat (real or perceived), it triggers the **fight-flight-freeze** response:

**Heart rate increases**, pumping blood to muscles so you can run or fight.
**Breathing quickens**, getting more oxygen in.
**Digestion stops**, energy is diverted away from non-essential functions.
**Muscles tense**, preparing for action.
**Attention narrows**, you focus only on the threat.

This response is incredibly useful if you're actually in danger. It's less useful when the "threat" is a work email, a social situation, or an uncertain future.

The key insight: **the physical sensations of anxiety are not dangerous.** They're uncomfortable, yes. But a racing heart during a panic attack is the same system that would save your life if you needed to dodge a car. It's misfiring, not malfunctioning.`,
        duration: 6,
      },
      {
        title: "Types of Anxiety",
        content: `Anxiety shows up in many forms. Understanding which one you're experiencing helps you choose the right response:

**Generalized Anxiety Disorder (GAD):** Persistent, excessive worry about everyday things, health, finances, relationships, work, that feels hard to control. Often accompanied by muscle tension, restlessness, and difficulty sleeping.

**Social Anxiety:** Intense fear of being judged, embarrassed, or humiliated in social situations. This goes beyond shyness, it can make everyday interactions feel threatening.

**Panic Disorder:** Sudden, intense episodes of fear that peak within minutes. Symptoms include chest pain, dizziness, tingling, and a feeling of losing control or dying. Despite how terrifying they are, panic attacks are not physically harmful.

**Specific Phobias:** Intense fear of a particular object or situation (heights, flying, needles, etc.) that's disproportionate to the actual risk.

**Health Anxiety:** Persistent worry about having or developing a serious illness, often despite medical reassurance.

All of these share a common thread: the brain's alarm system is **overestimating danger and underestimating your ability to cope.**`,
        duration: 7,
      },
      {
        title: "Grounding Techniques",
        content: `When anxiety spikes, grounding brings you back to the present moment, where you're actually safe.

**5-4-3-2-1 Technique:**
Name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, 1 you can taste. This activates your senses and pulls attention away from anxious thoughts.

**Box Breathing:**
Inhale for 4 seconds → Hold for 4 → Exhale for 4 → Hold for 4. Repeat 4–6 cycles. This directly activates the parasympathetic nervous system, telling your body "we're safe."

**Cold Water Reset:**
Splash cold water on your face or hold ice cubes. The **dive reflex** instantly slows heart rate and activates calming neurotransmitters.

**Progressive Muscle Relaxation:**
Tense each muscle group for 5 seconds, then release. Start with your toes and work up. The contrast between tension and release teaches your body what "relaxed" actually feels like.

These aren't avoidance strategies, they're **regulation** tools. They don't solve the problem, but they bring your arousal level down enough to think clearly about it.`,
        duration: 7,
      },
      {
        title: "Exposure: Facing What You Avoid",
        content: `Avoidance is anxiety's best friend. Every time you avoid something that makes you anxious, you get short-term relief, but you reinforce the message that the situation was genuinely dangerous.

**Exposure** is the process of gradually and deliberately facing feared situations, staying long enough for the anxiety to naturally decrease. This teaches your brain that the situation is not as dangerous as it predicted.

**How to do it safely:**
1. **Build a hierarchy.** List anxiety-provoking situations from least to most distressing (rate each 0–100).
2. **Start small.** Begin with the least distressing item.
3. **Stay present.** Don't use your phone or distract yourself. Notice the anxiety without fighting it.
4. **Wait for the drop.** Anxiety naturally decreases over time (habituation). Usually within 20–45 minutes.
5. **Repeat.** The same situation will provoke less anxiety each time.
6. **Move up the hierarchy.** Only when the current step feels manageable.

Exposure is uncomfortable by design. But discomfort is not danger. Working with a therapist can help you do this safely, especially for severe anxiety.`,
        duration: 8,
      },
    ],
  },
  {
    title: "Stress Management",
    description:
      "Learn to identify your stress signals, understand the stress response, and build a practical toolkit for managing daily stress.",
    category: "stress",
    order: 1,
    steps: [
      {
        title: "Understanding Stress",
        content: `Stress is your body's response to any demand placed on it. Like anxiety, stress isn't inherently bad, short bursts of stress can improve focus and performance (this is called **eustress**).

The problem is **chronic stress**, when demands pile up without adequate recovery. Over days, weeks, and months, this wears down your body and mind.

Chronic stress is linked to:
- Weakened immune function
- Sleep disruption
- Difficulty concentrating
- Irritability and mood changes
- Digestive issues
- Increased risk of anxiety and depression

The first step in managing stress isn't eliminating it, it's **recognizing what's actually stressing you** and distinguishing between what you can change and what you can't.`,
        duration: 5,
      },
      {
        title: "Your Stress Signature",
        content: `Everyone carries stress differently. Learning your personal **stress signature**, the early warning signs that stress is building, lets you intervene before you reach burnout.

**Physical signals:** Tension headaches, tight shoulders, jaw clenching, stomach issues, fatigue, changes in appetite.

**Emotional signals:** Irritability, feeling overwhelmed, snapping at others, emotional numbness, dread about things that didn't used to bother you.

**Behavioral signals:** Procrastinating, withdrawing from people, using substances more, skipping exercise, staying up late scrolling.

**Cognitive signals:** Difficulty concentrating, forgetfulness, negative self-talk, indecisiveness, racing thoughts.

Take a moment to identify your top 3–5 signals. These are your **early warning system**, the sooner you catch them, the easier they are to address.`,
        duration: 6,
      },
      {
        title: "The Stress Audit",
        content: `Most people carry stress they don't need to. A stress audit helps you sort your stressors into two categories:

**Circle of Control:** Things you can directly influence or change.
→ Your habits, how you spend your time, your responses, your boundaries.

**Circle of Concern:** Things you care about but can't control.
→ Other people's behavior, the economy, the past, global events.

The trap is spending your energy on the Circle of Concern while neglecting the Circle of Control. This creates a feeling of helplessness.

**Exercise:** Write down your top 10 stressors. For each one, ask: "Is this within my control?" If yes, what's one small action I can take? If no, can I accept this and redirect my energy?

This isn't about ignoring real problems, it's about being honest about where your effort actually makes a difference.`,
        duration: 7,
      },
      {
        title: "Building Your Stress Toolkit",
        content: `There is no single stress solution, effective stress management is a **toolkit** of strategies you can draw from depending on the situation.

**Immediate Relief (in the moment):**
- Box breathing (4-4-4-4)
- Cold water on wrists or face
- 5-minute walk outside
- Name the emotion out loud: "I'm feeling overwhelmed right now"

**Daily Maintenance (preventive):**
- 20–30 minutes of physical movement
- Consistent sleep schedule
- One meaningful social connection per day
- Time outdoors, even briefly
- Limiting news/social media intake

**Weekly Recovery:**
- An activity you do purely for enjoyment (not productivity)
- Time with no agenda
- Reflecting on what went well, not just what's pending
- Saying "no" to one thing you don't have capacity for

**Boundary Setting:**
- Identify your limits before you're past them
- Communicate them clearly and without apology
- Recognize that boundaries protect your ability to show up for others

Start with one strategy from each category. Consistency beats intensity.`,
        duration: 8,
      },
      {
        title: "Reframing Stress",
        content: `Research by psychologist Kelly McGonigal shows that **how you think about stress** affects how much it impacts you. People who view stress as harmful have worse health outcomes than those who view it as a challenge or a signal.

This doesn't mean pretending stress doesn't exist. It means reframing what it's telling you:

**Instead of:** "I'm so stressed, I can't handle this."
**Try:** "My body is mobilizing energy for something that matters to me."

**Instead of:** "This stress is going to destroy me."
**Try:** "Stress is uncomfortable, but I've handled hard things before."

**Instead of:** "I should be able to handle this without feeling stressed."
**Try:** "Feeling stressed means I care about this. What do I need to sustain my effort?"

Stress also activates a **challenge response**, different from the threat response, that increases cardiovascular efficiency and releases hormones that help you perform. This is the stress response that helped humans accomplish extraordinary things.

The goal isn't to eliminate stress. It's to **change your relationship with it** so it becomes information, not an identity.`,
        duration: 7,
      },
    ],
  },
  {
    title: "Understanding Depression",
    description:
      "Learn what depression actually is, how it differs from sadness, and what evidence-based approaches help.",
    category: "depression",
    order: 1,
    steps: [
      {
        title: "What Depression Is (and Isn't)",
        content: `Depression is not "just feeling sad." It's a medical condition that affects how you think, feel, and function. It involves changes in brain chemistry, sleep, appetite, energy, concentration, and motivation.

Key distinction: **Sadness** is a normal human emotion that comes and goes in response to specific events. **Depression** is persistent (lasting weeks or months), often has no clear trigger, and significantly interferes with daily life.

Depression is also not weakness, laziness, or a choice. The same brain that experiences depression is the brain that got you through every difficult day so far. It's working with altered chemistry, not missing some character trait.

Approximately 1 in 5 adults experience depression in their lifetime. You are not alone, and it is treatable.`,
        duration: 5,
      },
      {
        title: "How Depression Shows Up",
        content: `Depression looks different for everyone, but common signs include:

**Emotional:** Persistent sadness, emptiness, hopelessness, irritability, loss of interest in things you used to enjoy (anhedonia), feelings of worthlessness or excessive guilt.

**Physical:** Changes in sleep (too much or too little), changes in appetite (weight gain or loss), fatigue, unexplained aches and pains, slowed movement or speech.

**Cognitive:** Difficulty concentrating or making decisions, forgetfulness, negative self-talk, thoughts of death or suicide.

**Behavioral:** Withdrawing from people, neglecting responsibilities, reduced productivity, neglecting hygiene or self-care.

Depression often disguises itself. Some people appear fine on the outside while struggling internally. Some express depression as anger or irritability rather than sadness. Some stay busy to avoid confronting the emptiness.

If several of these signs have been present for more than two weeks, it's worth talking to a professional.`,
        duration: 7,
      },
      {
        title: "The Depression Cycle",
        content: `Depression creates a self-reinforcing cycle:

**Feel depressed** → lack energy and motivation → **do less** → feel guilty about doing less → **depression deepens** → do even less...

This cycle is why "just snap out of it" doesn't work. Depression removes the energy and motivation needed to fight it.

The way out isn't a single burst of willpower, it's **small, sustainable actions** that gradually break the cycle:

- You don't need to exercise for an hour. Walk for 5 minutes.
- You don't need to socialize deeply. Send one text.
- You don't need to clean the whole house. Put one thing away.
- You don't need to feel motivated first. Action often comes before motivation, not after.

This is called **behavioral activation**, one of the most effective components of CBT for depression. You don't wait until you feel better to do things. You do things, and gradually, you feel better.`,
        duration: 7,
      },
      {
        title: "Getting Help",
        content: `Depression is one of the most treatable mental health conditions. Effective options include:

**Therapy:** Cognitive Behavioral Therapy (CBT) and Behavioral Activation have strong evidence for depression. Interpersonal Therapy (IPT) and other approaches also work. Most people see improvement within 8–12 sessions.

**Medication:** Antidepressants (SSRIs, SNRIs, etc.) can help restore chemical balance. They often take 4–6 weeks to reach full effect. Finding the right medication may take some trial, this is normal, not failure.

**Combined:** For moderate to severe depression, therapy + medication together tend to be more effective than either alone.

**Lifestyle factors that support recovery:**
- Regular physical activity (even modest amounts help)
- Consistent sleep schedule
- Social connection (even when you don't feel like it)
- Reducing alcohol (it worsens depression)
- Sunlight and time outdoors

**If you're in crisis:** Contact the 988 Suicide & Crisis Lifeline (call or text 988 in the US) or your local emergency services. You deserve help.`,
        duration: 8,
      },
    ],
  },
  {
    title: "Sleep Hygiene",
    description:
      "Understand the science of sleep and build habits that improve your sleep quality and overall well-being.",
    category: "sleep",
    order: 1,
    steps: [
      {
        title: "Why Sleep Matters More Than You Think",
        content: `Sleep isn't passive downtime, it's when your brain consolidates memories, processes emotions, repairs cells, and clears metabolic waste. Chronic sleep deprivation affects every system in your body.

After just one night of poor sleep:
- Emotional reactivity increases by up to 60%
- Decision-making and focus decline
- Stress hormones rise
- Immune function drops

After sustained poor sleep:
- Risk of depression and anxiety doubles
- Chronic inflammation increases
- Weight gain becomes more likely
- Cardiovascular risk rises

The average adult needs **7–9 hours** per night. "I function fine on 6" often means "I've adapted to being impaired and don't remember what well-rested feels like."`,
        duration: 5,
      },
      {
        title: "Your Circadian Rhythm",
        content: `Your body runs on a roughly 24-hour internal clock called the **circadian rhythm**, primarily governed by light exposure.

**Morning:** Light (especially sunlight) signals your brain to stop producing melatonin and start producing cortisol and serotonin, waking you up.

**Evening:** As light fades, melatonin production increases, preparing your body for sleep.

**Disrupting this rhythm**, through late-night screens, irregular schedules, or inconsistent wake times, confuses your internal clock and makes both falling asleep and waking up harder.

**Key lever:** Get bright light within 30 minutes of waking (ideally sunlight). This sets your entire circadian rhythm for the day and makes it easier to fall asleep 14–16 hours later.

Your body also has a **sleep pressure** system (adenosine). The longer you're awake, the more adenosine builds up, increasing sleepiness. Caffeine blocks adenosine receptors, which is why it disrupts sleep even when you think you can handle it.`,
        duration: 6,
      },
      {
        title: "Sleep Hygiene Fundamentals",
        content: `These are evidence-based habits that support consistent, quality sleep:

**Consistent schedule:** Go to bed and wake up at the same time every day, including weekends. This is the single most powerful sleep habit.

**Cool environment:** The ideal sleep temperature is 60–67°F (15–19°C). Your body needs to cool down to initiate sleep.

**Dark room:** Use blackout curtains or a sleep mask. Even small amounts of light can suppress melatonin.

**No screens 30–60 minutes before bed:** Blue light suppresses melatonin. But more importantly, the content (social media, news, work) activates your brain when it should be winding down.

**Limit caffeine after 2 PM:** Caffeine has a half-life of 5–7 hours. A 3 PM coffee means half the caffeine is still in your system at 8–10 PM.

**Limit alcohol before bed:** Alcohol may help you fall asleep faster, but it severely disrupts sleep quality, especially REM sleep.

**Reserve your bed for sleep:** Working, scrolling, or watching TV in bed trains your brain to associate the bed with wakefulness instead of sleep.`,
        duration: 7,
      },
      {
        title: "When You Can't Sleep",
        content: `Lying in bed unable to sleep is one of the most frustrating experiences, and trying harder to sleep makes it worse.

**The 20-minute rule:** If you've been lying awake for about 20 minutes (don't watch the clock, estimate), get up. Go to another room and do something low-stimulation (reading, gentle stretching, quiet music). Return to bed when you feel sleepy.

Why? Staying in bed while frustrated creates an association between your bed and wakefulness. Breaking that pattern preserves the bed as a cue for sleep.

**Don't watch the clock:** Clock-watching triggers anxiety about lost sleep, which increases arousal and makes sleep harder. Turn your clock away from you.

**What to do if your mind races:**
- Write down tomorrow's to-do list (externalize the worry)
- Do a body scan meditation
- Try "cognitive shuffling", think of random, unrelated words (apple, bicycle, cloud...)
- Practice deep breathing: 4 counts in, 7 counts hold, 8 counts out

**What NOT to do:**
- Don't check your phone
- Don't "try harder" to sleep
- Don't nap during the day (if you're struggling with nighttime sleep)
- Don't stress about the lost sleep, one bad night doesn't harm you`,
        duration: 8,
      },
    ],
  },
  {
    title: "Relationship Skills",
    description:
      "Build stronger connections through better communication, boundary-setting, and understanding attachment patterns.",
    category: "relationships",
    order: 1,
    steps: [
      {
        title: "Communication Foundations",
        content: `Most relationship conflict isn't about the topic being discussed, it's about **how** it's discussed. Good communication is a skill, not a personality trait.

**The basics:**

**Use "I" statements:** "I feel overlooked when decisions are made without me" instead of "You never include me." This reduces defensiveness because you're describing your experience, not attacking their character.

**Listen to understand, not to respond:** When someone is talking, notice if you're genuinely hearing them or just planning your rebuttal. Reflect back what you heard: "It sounds like you're saying..."

**Be specific:** "I need more help" is vague. "Could you handle dishes on Tuesday and Thursday?" is actionable.

**Don't stack issues:** Raising five grievances at once overwhelms the listener and makes resolution impossible. One issue at a time.

**Assume good intent (until proven otherwise):** Most people aren't trying to hurt you. Starting from that assumption changes the entire tone of a conversation.`,
        duration: 6,
      },
      {
        title: "Attachment Styles",
        content: `Attachment theory describes how our early experiences with caregivers shape how we relate to others in close relationships. The four main styles:

**Secure (approximately 56% of adults):** Comfortable with intimacy and independence. Communicates needs clearly, trusts others, handles conflict without shutting down or panicking.

**Anxious (approximately 20%):** Craves closeness but fears abandonment. May become clingy, need frequent reassurance, or react strongly to perceived distance. Often originated from inconsistent caregiving.

**Avoidant (approximately 25%):** Values independence over closeness. May withdraw during conflict, suppress emotions, or feel suffocated by intimacy needs. Often originated from emotionally distant caregiving.

**Disorganized (approximately 3–5%):** A mix of anxious and avoidant patterns. Craves closeness but fears it. Often originated from frightening or traumatic caregiving.

**Important:** Attachment styles are not fixed. Understanding yours helps you:
- Recognize your triggers
- Choose responses instead of reacting
- Communicate your needs more clearly
- Understand your partner's behavior with compassion rather than judgment

Self-awareness is the foundation of healthier relationships.`,
        duration: 8,
      },
      {
        title: "Setting Boundaries",
        content: `Boundaries aren't walls. They're **guidelines** that tell others how to treat you and where your responsibilities end. Setting them is an act of self-respect, not selfishness.

**Signs you need better boundaries:**
- You feel resentful toward people you care about
- You say "yes" when you mean "no"
- You feel responsible for other people's emotions
- You're exhausted from giving too much

**How to set a boundary:**
1. **Identify the boundary.** What do you need? (Less time on calls, not lending money, not being criticized about your weight.)
2. **Communicate it clearly.** "I can't talk on the phone past 9 PM."
3. **Be prepared for pushback.** People who benefited from your lack of boundaries will resist the change.
4. **Enforce it consistently.** A boundary without enforcement is a suggestion.
5. **Don't over-explain.** "I can't make it" is complete. You don't owe a 10-minute justification.

**Remember:** Boundaries protect the relationship. A relationship that can only exist without your boundaries is not a relationship worth maintaining.`,
        duration: 7,
      },
      {
        title: "Repair After Conflict",
        content: `Conflict in relationships is inevitable. What determines relationship health isn't the absence of conflict, it's the ability to **repair** after it.

**The repair process:**

1. **Cool down first.** Don't try to resolve things when you're flooded with emotion. Agree on a time to revisit the conversation.

2. **Take responsibility for your part.** Even if you're 10% responsible, own that 10%. "I shouldn't have raised my voice" goes further than "Well, you started it."

3. **Validate their experience.** "I can see why that hurt you" doesn't mean you agree, it means you understand.

4. **Express what you need going forward.** "In the future, I'd appreciate it if..." instead of "You always..." or "You never..."

5. **Accept that some conflicts are ongoing.** Not every disagreement has a solution. Sometimes the goal is understanding, not resolution.

Research by John Gottman shows that successful couples aren't the ones who never fight, they're the ones who **repair effectively**. A repair attempt (a joke, an apology, a touch on the arm) can defuse tension even in the middle of a heated argument.

The willingness to repair is more important than the desire to be right.`,
        duration: 8,
      },
    ],
  },
]

async function seed() {
  try {
    await connectDB()
    logger.info("Connected to database")

    const count = await PsychoedModule.countDocuments()
    if (count > 0) {
      logger.info(`Database already has ${count} modules. Clearing and re-seeding...`)
      await PsychoedModule.deleteMany({})
    }

    const result = await PsychoedModule.insertMany(modules)
    logger.info(`Seeded ${result.length} psychoeducation modules`)

    for (const mod of result) {
      logger.info(`  - ${mod.title} (${mod.steps.length} steps)`)
    }

    process.exit(0)
  } catch (err) {
    logger.error({ err }, "Failed to seed modules")
    process.exit(1)
  }
}

seed()

import { Program, UserProgress } from "../models/program.model.js"
import { awardMessagePoints } from "../utils/points.js"
import logger from "../utils/logger.js"

const SEED_PROGRAMS = [
  {
    title: "Anxiety Basics",
    description:
      "A 4-week journey to understand, manage, and reduce anxiety using evidence-based techniques from CBT and mindfulness.",
    category: "anxiety",
    duration: "4 weeks",
    weeks: [
      {
        title: "Understanding Your Anxiety",
        description:
          "Learn what anxiety is, how it manifests, and identify your personal triggers and patterns.",
        activities: [
          {
            title: "What Is Anxiety?",
            description:
              "Anxiety is your body's natural alarm system. It activates the fight-or-flight response even when there's no real danger. Understanding the difference between helpful anxiety (which keeps you safe) and unhelpful anxiety (which interferes with daily life) is the first step to managing it.\n\nKey facts:\n• Anxiety disorders affect 40 million adults in the U.S. alone\n• Physical symptoms include rapid heartbeat, sweating, trembling, and difficulty breathing\n• Cognitive symptoms include racing thoughts, catastrophizing, and difficulty concentrating\n• Anxiety is highly treatable — most people improve significantly with practice",
            type: "reading",
            duration: "10 min",
          },
          {
            title: "Anxiety Mapping Exercise",
            description:
              "Take 10 minutes to write down your personal anxiety patterns. For each entry, note:\n\n1. The situation (What triggered the anxiety?)\n2. Physical sensations (Where do you feel it in your body?)\n3. Thoughts (What went through your mind?)\n4. Behaviors (What did you do or want to do?)\n\nDon't judge yourself — just observe. This map will help you recognize patterns over time and become the foundation for your personalized anxiety management plan.",
            type: "reflection",
            duration: "10 min",
          },
          {
            title: "Anxiety Rating Scale",
            description:
              "Rate your current anxiety on a scale of 1-10 for:\n\n• Work/School anxiety\n• Social anxiety\n• Health anxiety\n• Financial anxiety\n• Relationship anxiety\n\nFor each area, rate both frequency (how often) and intensity (how strong). This baseline will help you track your progress throughout this program.\n\nRemember: There's no 'right' score. Awareness is the goal, not perfection.",
            type: "checkin",
            duration: "5 min",
          },
          {
            title: "The Anxiety-Performance Curve",
            description:
              "Read about the Yerkes-Dodson Law: moderate anxiety actually improves performance. It's only when anxiety becomes too high that it starts to hurt. Your goal isn't to eliminate anxiety — it's to find the sweet spot where it motivates without overwhelming.\n\nThink of anxiety like the gas pedal in a car: a little pressure helps you move forward, but pressing too hard just causes problems. Throughout this program, you'll learn to modulate that pressure rather than slam on the brakes.",
            type: "reading",
            duration: "8 min",
          },
        ],
      },
      {
        title: "Breathing Techniques",
        description:
          "Master powerful breathing exercises that activate your parasympathetic nervous system to calm anxiety in minutes.",
        activities: [
          {
            title: "4-7-8 Breathing Technique",
            description:
              "This technique, developed by Dr. Andrew Weil, is a natural tranquilizer for the nervous system.\n\nSteps:\n1. Exhale completely through your mouth, making a whoosh sound\n2. Close your mouth and inhale quietly through your nose for 4 seconds\n3. Hold your breath for 7 seconds\n4. Exhale completely through your mouth for 8 seconds\n5. Repeat 3-4 times\n\nPractice this at least twice daily. With regular practice, you'll notice you can calm yourself more quickly in anxious moments. Start with 3 rounds and gradually increase to 4 rounds as you get comfortable.",
            type: "exercise",
            duration: "5 min",
          },
          {
            title: "Box Breathing",
            description:
              "Used by Navy SEALs to stay calm under pressure, box breathing is simple yet powerful.\n\nSteps:\n1. Breathe in for 4 seconds\n2. Hold for 4 seconds\n3. Breathe out for 4 seconds\n4. Hold for 4 seconds\n5. Repeat for 2-5 minutes\n\nVisualize tracing the four sides of a square with each phase. This technique works because the extended exhale and holds activate the vagus nerve, which triggers your body's relaxation response.\n\nTip: If 4 seconds feels too long, start with 3 seconds and work your way up.",
            type: "exercise",
            duration: "5 min",
          },
          {
            title: "Belly Breathing Check-in",
            description:
              "Practice diaphragmatic (belly) breathing and notice how your anxiety changes:\n\n1. Place one hand on your chest, one on your belly\n2. Breathe so that only the belly hand rises (chest stays relatively still)\n3. Do this for 2 minutes\n4. Rate your anxiety before and after (1-10)\n\nNotice: Does your mind feel clearer? Are your shoulders less tense? The physical shift from shallow chest breathing to deep belly breathing sends a direct signal to your brain that you're safe.\n\nAim to notice when you're chest-breathing during the day and gently shift to belly breathing.",
            type: "checkin",
            duration: "5 min",
          },
        ],
      },
      {
        title: "Challenging Anxious Thoughts",
        description:
          "Learn to identify cognitive distortions and replace anxious thinking with more balanced, realistic thoughts.",
        activities: [
          {
            title: "Common Cognitive Distortions",
            description:
              "Cognitive distortions are patterns of thinking that feel true but are actually biased or inaccurate. The most common ones in anxiety:\n\n• Catastrophizing: Jumping to the worst-case scenario\n  Example: 'If I fail this test, I'll never get a job, and my life will be ruined'\n\n• Mind Reading: Assuming you know what others think\n  Example: 'Everyone at the party thinks I'm boring'\n\n• Fortune Telling: Predicting negative outcomes without evidence\n  Example: 'This presentation is going to be a disaster'\n\n• All-or-Nothing Thinking: Seeing things in black and white\n  Example: 'If I'm not perfect, I'm a complete failure'\n\n• Overgeneralization: One bad event means it always happens\n  Example: 'I got rejected once, so nobody will ever want me'\n\nRead through these and notice which ones show up most often in your own thinking.",
            type: "reading",
            duration: "10 min",
          },
          {
            title: "Thought Record Practice",
            description:
              "When you notice anxiety rising, use this 5-column thought record:\n\n1. Situation: What happened?\n2. Automatic Thought: What went through your mind?\n3. Emotion: What did you feel? (rate intensity 0-100)\n4. Evidence For: What supports this thought?\n5. Evidence Against: What contradicts this thought?\n\nThen write a Balanced Thought that accounts for both sides.\n\nExample:\n• Situation: Boss sent a brief email saying 'We need to talk'\n• Thought: I'm going to be fired\n• Emotion: Fear (85/100)\n• For: The email was short and didn't give details\n• Against: Boss has given me positive feedback recently, 'we need to talk' is normal phrasing, I have no performance warnings\n• Balanced: My boss probably wants to discuss a project. The brief email doesn't necessarily mean anything bad.\n\nDo at least one thought record today.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "Worry Time Scheduling",
            description:
              "Counterintuitive but effective: instead of trying to stop worrying, schedule a specific 15-minute 'worry window' each day.\n\nRules:\n1. Choose a consistent time (not right before bed)\n2. When anxious thoughts appear outside this window, jot them down and say 'I'll think about this at 6pm'\n3. During your worry window, examine each worry using the thought record technique\n4. When the timer goes off, stop worrying and do something enjoyable\n\nMost people find that by the time worry window arrives, many of the worries have already lost their power. Those that remain can be addressed more calmly.\n\nTry this for the rest of the week.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "Evidence Journal",
            description:
              "At the end of today, write down three pieces of evidence that contradict your biggest worry. For example:\n\nIf you worry 'Nobody likes me':\n• Evidence: My friend texted me to hang out yesterday\n• Evidence: My coworker laughed at my joke\n• Evidence: My family called just to check on me\n\nThis isn't about toxic positivity or ignoring real problems. It's about training your brain to see the full picture instead of only scanning for threats. Our anxious brains are wired to notice danger and dismiss safety — this exercise rebalances that bias.\n\nKeep this practice going throughout the program.",
            type: "reflection",
            duration: "10 min",
          },
        ],
      },
      {
        title: "Building Your Anxiety Management Plan",
        description:
          "Create a personalized toolkit of strategies you can use whenever anxiety strikes.",
        activities: [
          {
            title: "Your Anxiety Toolkit",
            description:
              "Create your personal anxiety management toolkit by selecting the techniques that work best for you:\n\nBreathing (choose 1-2 favorites):\n□ 4-7-8 breathing\n□ Box breathing\n□ Belly breathing\n□ Alternate nostril breathing\n\nCognitive (choose 1-2 favorites):\n□ Thought records\n□ Evidence journaling\n□ Worry window\n□ Worst-case scenario planning\n\nPhysical (choose 1-2 favorites):\n□ Progressive muscle relaxation\n□ Walking/movement\n□ Cold water on wrists\n□ Grounding (5-4-3-2-1)\n\nSocial:\n□ Talk to a trusted person\n□ Join a support group\n□ Schedule time with friends\n\nWrite down your chosen toolkit and keep it accessible — in your phone notes, on your wall, or wherever you'll see it when you need it most.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "Progress Review",
            description:
              "Take a moment to reflect on your journey through this program:\n\n1. Re-rate your anxiety on the same 1-10 scales from Week 1 (work, social, health, financial, relationships)\n2. Which technique has been most helpful for you?\n3. What surprised you most about this program?\n4. What's one thing you'll continue doing daily?\n\nCompare your current ratings to your Week 1 baseline. Even small changes are significant — the fact that you completed this program shows commitment to your mental health.\n\nRemember: Managing anxiety is an ongoing practice, not a one-time fix. Be patient with yourself.",
            type: "reflection",
            duration: "10 min",
          },
          {
            title: "Maintenance Plan Check-in",
            description:
              "Write your ongoing maintenance plan:\n\nDaily practices (choose 2-3):\n• Morning breathing exercise: ___\n• Midday check-in: ___\n• Evening reflection: ___\n\nWeekly practices:\n• Review thought records from the week\n• Practice the most challenging situation from the week\n• Schedule one enjoyable activity\n\nWarning signs to watch for:\n• Increased sleep disturbance\n• Avoidance of situations you previously handled\n• Persistent physical tension\n• Isolation from others\n\nIf you notice these signs lasting more than two weeks, consider reaching out to a therapist for additional support.\n\nYou've built real skills this month. Trust them.",
            type: "checkin",
            duration: "10 min",
          },
        ],
      },
    ],
  },
  {
    title: "Mood Boost",
    description:
      "A 3-week program combining mood tracking, gratitude practice, and behavioral activation to elevate your daily emotional state.",
    category: "mood",
    duration: "3 weeks",
    weeks: [
      {
        title: "Mood Awareness",
        description:
          "Learn to recognize your emotional patterns, understand what influences your mood, and build emotional vocabulary.",
        activities: [
          {
            title: "Emotional Vocabulary Builder",
            description:
              "Most people use just a handful of words to describe their emotions: happy, sad, angry, fine. But research shows that people who can identify and name their emotions more precisely (called 'emotional granularity') are better at managing them.\n\nStudy this expanded vocabulary:\n\nHigh energy/pleasant: excited, grateful, hopeful, proud, confident, inspired, content, peaceful, amazed\nLow energy/pleasant: calm, relaxed, tender, nostalgic, satisfied, serene, relieved\nHigh energy/unpleasant: anxious, frustrated, irritated, overwhelmed, panicked, jealous, resentful\nLow energy/unpleasant: sad, disappointed, lonely, bored, exhausted, ashamed, hopeless, numb\n\nTry to identify which specific emotion you're feeling right now — not just 'good' or 'bad'.",
            type: "reading",
            duration: "10 min",
          },
          {
            title: "Mood Tracking Baseline",
            description:
              "Record your current mood using the mood tracker. For each entry today, note:\n\n1. Your mood (great/good/okay/bad/terrible)\n2. Intensity (1-10)\n3. At least one factor that influenced it\n\nYou'll be tracking your mood daily throughout this program. Don't worry about having 'good' moods — the goal is awareness, not perfection. Bad days are data too, and they help you understand your patterns.\n\nSet a phone reminder to check in with your mood at least twice a day: once in the morning and once in the evening.",
            type: "checkin",
            duration: "5 min",
          },
          {
            title: "Mood Pattern Reflection",
            description:
              "Think about your mood patterns over the past week and answer:\n\n1. What time of day do you typically feel best? Worst?\n2. What activities tend to boost your mood?\n3. What tends to lower your mood?\n4. Are there people who consistently lift you up? Bring you down?\n5. How does sleep affect your mood the next day?\n6. What's the relationship between exercise and your mood?\n\nThese patterns will help you make small but powerful adjustments. For example, if you notice your mood consistently dips in the afternoon, you might schedule a brief walk or call a friend at that time.\n\nWrite your observations — they're the blueprint for your personalized mood-boosting plan.",
            type: "reflection",
            duration: "15 min",
          },
        ],
      },
      {
        title: "Gratitude Practice",
        description:
          "Build a sustainable gratitude practice backed by neuroscience to rewire your brain's negativity bias.",
        activities: [
          {
            title: "The Science of Gratitude",
            description:
              "Gratitude isn't just a nice feeling — it literally changes your brain. Research from UCLA's Mindfulness Awareness Research Center shows that regularly expressing gratitude:\n\n• Increases dopamine and serotonin production (the same neurotransmitters targeted by antidepressants)\n• Activates the brain's reward centers\n• Reduces cortisol levels by up to 23%\n• Improves sleep quality\n• Strengthens immune function\n\nThe key is specificity and depth. 'I'm grateful for my family' is okay, but 'I'm grateful that my sister called me just to check in, even though she was busy' activates more neural pathways because it involves detailed, vivid recall.\n\nYour brain physically rewires after just 21 days of consistent gratitude practice. Let's start building that pathway.",
            type: "reading",
            duration: "8 min",
          },
          {
            title: "Three Good Things Practice",
            description:
              "This is one of the most well-researched positive psychology interventions. Here's how:\n\nEvery evening for the rest of this week:\n1. Write down three good things that happened today (they can be small)\n2. For each one, write WHY it happened — your role in it, the circumstances, other people involved\n3. Write how it made you feel in detail\n\nExamples:\n• 'My coworker brought me coffee. She noticed I seemed tired. It made me feel cared for and connected.'\n• 'I finished the report ahead of deadline. I stayed focused by turning off notifications. I felt accomplished.'\n• 'The sun came out during my walk. The warmth on my face made me feel peaceful and present.'\n\nThe 'why' part is crucial — it helps your brain associate positive outcomes with your actions and environment, rather than dismissing them as random luck.",
            type: "exercise",
            duration: "10 min",
          },
          {
            title: "Gratitude Letter",
            description:
              "Write a detailed letter (at least 150 words) to someone who has positively impacted your life but whom you've never properly thanked. Be specific:\n\n• What did they do?\n• How did it affect you?\n• What do they mean to you?\n\nYou don't have to send the letter (though research shows that sending it has an even bigger impact on both your mood and theirs). Simply writing it activates the brain's gratitude circuits.\n\nIf you feel comfortable, consider reading it to them in person, over the phone, or sending it. The 'gratitude visit' is one of the strongest happiness interventions known to psychology.",
            type: "exercise",
            duration: "20 min",
          },
          {
            title: "Gratitude Check-in",
            description:
              "Pause right now and notice five things you can be grateful for in this exact moment. They can be as simple as:\n\n• The chair supporting your body\n• Your lungs breathing without you thinking about it\n• Access to the technology that lets you do this program\n• Something good that happened today\n• A quality you like about yourself\n\nGratitude isn't about ignoring problems — it's about training your brain to notice what's already working alongside what needs attention. The brain's negativity bias means we need to deliberately practice noticing the good.\n\nRate your current mood (1-10): ____\nCompare to your mood before starting this activity.",
            type: "checkin",
            duration: "5 min",
          },
        ],
      },
      {
        title: "Activity Scheduling",
        description:
          "Use behavioral activation to plan and engage in mood-boosting activities, breaking the cycle of avoidance and withdrawal.",
        activities: [
          {
            title: "Pleasant Activity List",
            description:
              "Behavioral activation is a core technique in treating depression and low mood. The principle is simple: when we feel bad, we tend to stop doing things. When we stop doing things, we feel worse. Breaking this cycle requires deliberately scheduling activities.\n\nRate each activity for how much pleasure (P) and mastery/accomplishment (M) you'd expect from it (1-10):\n\nSocial: Call a friend, Have coffee with someone, Help someone, Host a small gathering\nPhysical: Walk in nature, Dance to music, Stretch, Play a sport, Swim\nCreative: Draw or paint, Cook a new recipe, Write, Play music, Garden\nMindful: Meditate, Watch a sunset, Sit in silence, Do a puzzle\nProductive: Organize a space, Complete a small project, Learn something new, Plan something fun\nRestorative: Take a bath, Read for pleasure, Listen to a podcast, Nap without guilt\n\nCircle at least 5 activities you'd like to schedule this week. Include a mix of high-P and high-M activities.",
            type: "reading",
            duration: "10 min",
          },
          {
            title: "This Week's Mood Schedule",
            description:
              "Schedule at least one mood-boosting activity for each day this week. Be specific — don't just write 'exercise,' write '30-minute walk in the park at 7am.'\n\nMonday: ___\nTuesday: ___\nWednesday: ___\nThursday: ___\nFriday: ___\nSaturday: ___\nSunday: ___\n\nGuidelines:\n• Include at least one social activity\n• Include at least one physical activity\n• Include at least one activity just for fun (no productivity required!)\n• Schedule activities during your naturally higher-energy times\n• Keep it realistic — don't over-schedule\n\nAfter each activity, rate your mood before and after. Many people are surprised to find that mood improves most when they least feel like doing the activity.",
            type: "exercise",
            duration: "10 min",
          },
          {
            title: "Week-End Reflection",
            description:
              "Review your week and answer:\n\n1. How many of your scheduled activities did you complete?\n2. Which activity had the biggest positive impact on your mood?\n3. Did you notice any patterns (e.g., physical activities boost mood more, social activities drain or energize you)?\n4. Were there activities you kept putting off? What was getting in the way?\n5. What will you do differently next week?\n\nRemember: Completion isn't the goal — engagement is. Even partial effort counts. If you planned a 30-minute walk and did 10 minutes, that's a win. Start where you are.\n\nRate your overall mood this week (1-10): ____",
            type: "reflection",
            duration: "15 min",
          },
        ],
      },
    ],
  },
  {
    title: "Stress Survival",
    description:
      "A 4-week program to identify stress sources, build coping skills, improve time management, and develop lasting resilience.",
    category: "stress",
    duration: "4 weeks",
    weeks: [
      {
        title: "Stress Identification",
        description:
          "Map your stress landscape, understand the difference between good and bad stress, and identify your personal stress responses.",
        activities: [
          {
            title: "Understanding Stress",
            description:
              "Not all stress is harmful. 'Eustress' (good stress) is what motivates you to meet a deadline, perform in a competition, or learn something new. 'Distress' is what overwhelms your ability to cope.\n\nThe key factors that make stress harmful:\n• Duration: Chronic stress is far more damaging than acute stress\n• Controllability: Stress you can control motivates; uncontrollable stress paralyzes\n• Predictability: Expected challenges are easier to handle than surprises\n• Social support: Isolation amplifies every stressor\n\nChronic stress impacts:\n• Brain: Shrinks the hippocampus (memory) and prefrontal cortex (decision-making)\n• Heart: Increases blood pressure and inflammation\n• Immune system: Suppresses immune function\n• Digestion: Causes IBS, ulcers, appetite changes\n• Sleep: Disrupts circadian rhythm\n\nUnderstanding these effects isn't meant to stress you out — it's motivation to take stress management seriously.",
            type: "reading",
            duration: "10 min",
          },
          {
            title: "Stress Inventory",
            description:
              "List your top 10 current stressors. For each one, rate:\n\n1. Source: (work/relationship/health/financial/other)\n2. Severity: (1-10)\n3. Controllability: (1 = completely out of my control, 10 = fully under my control)\n4. Duration: (temporary/ongoing)\n\nThis inventory serves two purposes:\n1. It gets stressors out of your head and onto paper, reducing rumination\n2. It reveals which stressors you can actually address\n\nCircle any stressor rated 7+ for controllability. These are your action items — the ones you can actually change. For the low-controllability stressors, you'll focus on coping strategies rather than solutions.\n\nThere is no wrong way to do this exercise. Just be honest with yourself.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "Body Stress Scan",
            description:
              "Your body holds stress even when your mind thinks you're 'fine.' Do this scan:\n\n1. Close your eyes and breathe deeply three times\n2. Starting from the top of your head, slowly scan down:\n   • Forehead: Is it smooth or furrowed?\n   • Jaw: Are your teeth clenched?\n   • Neck/Shoulders: Are they raised toward your ears?\n   • Chest: Is your breathing shallow?\n   • Stomach: Is it tight or churning?\n   • Hands: Are they clenched?\n   • Lower back: Is there tension?\n   • Legs/Feet: Are they restless or heavy?\n3. Rate overall body tension (1-10)\n\nThis is your baseline. You'll repeat this scan regularly. Over time, you'll catch stress earlier — before it becomes a full-body experience.\n\nNote where you hold the most tension. These are your body's stress signals.",
            type: "checkin",
            duration: "10 min",
          },
        ],
      },
      {
        title: "Relaxation Skills",
        description:
          "Master multiple relaxation techniques to deploy in real-time when stress hits.",
        activities: [
          {
            title: "Progressive Muscle Relaxation (PMR)",
            description:
              "PMR, developed by Dr. Edmund Jacobson, systematically releases muscle tension. Practice daily for best results.\n\nStarting from your feet and working up:\n1. Curl your toes tightly for 5 seconds → Release and notice the contrast for 10 seconds\n2. Tense your calves for 5 seconds → Release\n3. Tense your thighs for 5 seconds → Release\n4. Clench your glutes for 5 seconds → Release\n5. Make fists with your hands for 5 seconds → Release\n6. Tense your biceps for 5 seconds → Release\n7. Raise your shoulders to your ears for 5 seconds → Release\n8. Scrunch your face for 5 seconds → Release\n\nThe key insight: you can't be both tense and relaxed at the same time. This teaches your body the contrast between tension and relaxation, making it easier to release stress throughout the day.\n\nDo this before bed for improved sleep quality.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "The 5-4-3-2-1 Grounding Technique",
            description:
              "When stress feels overwhelming, ground yourself in the present moment using your senses:\n\n5 things you can SEE: Look around and name them specifically\n  (not just 'a wall' but 'a blue wall with a small crack near the corner')\n\n4 things you can TOUCH: Reach out and physically feel them\n  (the texture of your clothes, the smooth phone screen, the cool table)\n\n3 things you can HEAR: Listen carefully and identify distinct sounds\n  (the hum of a fan, distant traffic, your own breathing)\n\n2 things you can SMELL: Notice scents around you\n  (coffee, soap on your hands, the air)\n\n1 thing you can TASTE: Notice the taste in your mouth\n  (toothpaste, food you last ate, just the taste of your own mouth)\n\nThis technique works because it redirects your brain from worry (future-focused) to the present moment (sensory-focused). Practice it when you're calm so it's available when you need it.",
            type: "exercise",
            duration: "5 min",
          },
          {
            title: "Body Scan Meditation",
            description:
              "This is different from the stress scan — it's a meditation practice for deep relaxation.\n\n1. Lie down or sit comfortably\n2. Close your eyes and take 5 deep breaths\n3. Bring attention to the top of your head\n4. Slowly move your attention down through each body part, spending about 30 seconds on each:\n   Head → Face → Jaw → Neck → Shoulders → Arms → Hands → Chest → Belly → Hips → Thighs → Calves → Feet\n5. At each area, simply notice sensations without trying to change them\n6. If your mind wanders, gently return to wherever you left off\n7. End by taking 3 deep breaths and slowly opening your eyes\n\nDon't worry about doing it 'right.' The practice IS the benefit — returning your attention again and again strengthens your ability to focus and relax.\n\nPractice 3-4 times this week.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "Quick Stress Reset",
            description:
              "Practice this rapid stress reset you can do anywhere, even in a meeting:\n\nThe Physiological Sigh (discovered by Stanford neuroscientist Dr. Andrew Huberman):\n1. Take a deep inhale through your nose\n2. At the top, take a second, shorter inhale through your nose (to fully inflate the lungs)\n3. Exhale slowly and fully through your mouth\n4. Repeat 1-3 times\n\nThis is the fastest known way to reduce real-time stress. It works by popping open the tiny air sacs (alveoli) in your lungs that may have collapsed during shallow breathing, maximizing CO2 offload.\n\nOther quick resets:\n• Splash cold water on your face (triggers the dive reflex, slowing heart rate)\n• Step outside for 60 seconds of fresh air\n• Listen to one song you love with full attention\n\nNote which quick reset works best for you.",
            type: "checkin",
            duration: "5 min",
          },
        ],
      },
      {
        title: "Time Management",
        description:
          "Learn practical strategies to manage your time, reduce overwhelm, and create space for what matters.",
        activities: [
          {
            title: "The Time Audit",
            description:
              "Before managing your time better, understand where it actually goes. For the past 24 hours (or estimate as best you can):\n\nCategorize your time into:\n• Productive work: ___\n• Meetings/calls: ___\n• Commuting: ___\n• Chores/errands: ___\n• Self-care/exercise: ___\n• Socializing: ___\n• Screen time (non-work): ___\n• Sleep: ___\n• Other: ___\n\nTotal should be approximately 168 hours/week.\n\nMost people are surprised by the gap between how they THINK they spend time and how they ACTUALLY spend it. Common findings:\n• More time on social media than expected\n• Less time on relationships than intended\n• Significant time lost to context switching\n• 'Busy' time that isn't actually productive\n\nThis audit isn't about judgment — it's about awareness. You can't optimize what you don't measure.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "Eisenhower Matrix",
            description:
              "Organize your tasks by urgency and importance:\n\nQUADRANT 1 — DO (Urgent + Important):\n• Deadlines, crises, pressing problems\n• Action: Do these first, today\n\nQUADRANT 2 — SCHEDULE (Not Urgent + Important):\n• Exercise, relationships, long-term goals, skill building\n• Action: Schedule specific times — this is where growth happens\n\nQUADRANT 3 — DELEGATE (Urgent + Not Important):\n• Most emails, some meetings, other people's minor requests\n• Action: Automate, delegate, or minimize\n\nQUADRANT 4 — ELIMINATE (Not Urgent + Not Important):\n• Excessive social media, gossip, busy work\n• Action: Reduce or eliminate\n\nTake your current task list from the time audit and sort each item into a quadrant. Most people find they spend too much time in Q1 and Q3, and not enough in Q2.\n\nThe goal: spend more time on Q2 activities, which reduce future Q1 crises.",
            type: "exercise",
            duration: "15 min",
          },
          {
            title: "The Daily Top 3",
            description:
              "Simplify your task management with this daily practice:\n\nEvery evening (or first thing in the morning), identify:\n\n1. Your TOP 3 priorities for tomorrow\n2. Estimate time for each\n3. Schedule them in your calendar\n4. Identify ONE thing you can let go of or simplify\n\nRules:\n• Maximum 3 items — this forces prioritization\n• At least one should be a Q2 activity (important but not urgent)\n• Be realistic about timing — add 50% buffer to your estimates\n• Include a 'stop time' so work doesn't expand to fill all available time\n\nWhy it works: Decision fatigue is real. By deciding your priorities in advance, you wake up with clarity instead of overwhelm. The brain feels less stressed when it knows there's a plan.\n\nTry this for the rest of the week and notice the difference.",
            type: "exercise",
            duration: "10 min",
          },
          {
            title: "Stress Check-in",
            description:
              "Pause and rate:\n\n1. Overall stress level (1-10): ____\n2. Most stressful area right now: ____\n3. Body tension level (1-10): ____\n4. Hours of sleep last night: ____\n5. Did you use any relaxation technique today? (yes/no) Which one?\n\nCompare to your Week 1 baseline. Any changes?\n\nRemember: Stress management isn't about having zero stress — it's about having the tools to handle it. If your stress level is still high but you feel more equipped to manage it, that's genuine progress.\n\nIf stress is significantly higher than Week 1, consider whether you need to:\n• Prioritize sleep\n• Add more Q2 activities to your schedule\n• Use relaxation techniques more frequently\n• Talk to someone about what you're carrying",
            type: "checkin",
            duration: "5 min",
          },
        ],
      },
      {
        title: "Building Resilience",
        description:
          "Develop long-term resilience — the ability to bounce back from adversity and grow through challenges.",
        activities: [
          {
            title: "What Is Resilience?",
            description:
              "Resilience isn't about never struggling — it's about recovering from struggle. Research shows resilient people:\n\n• Acknowledge emotions rather than suppress them\n• Maintain social connections even during hard times\n• Find meaning in difficult experiences\n• Focus on what they can control\n• Practice self-compassion\n• View failure as information, not identity\n\nImportant myth: Resilience isn't a fixed trait. It's a set of skills and habits that anyone can develop. You've already been building resilience by completing this program.\n\nThe key insight from resilience research: It's not about bouncing BACK to who you were before — it's about bouncing FORWARD, using the challenge to grow. This is called 'post-traumatic growth,' and it's more common than people think.\n\nYour past challenges have already made you more resilient than you realize. Let's build on that foundation.",
            type: "reading",
            duration: "10 min",
          },
          {
            title: "Resilience Self-Assessment",
            description:
              "Rate yourself honestly on each resilience factor (1 = needs work, 5 = strong):\n\n• I can identify and name my emotions: ___\n• I have at least one person I can talk to honestly: ___\n• I can find meaning or lessons in difficult situations: ___\n• I have healthy coping strategies (not avoidance/substances): ___\n• I can accept things I can't control: ___\n• I practice self-compassion when I fail: ___\n• I take care of my physical health (sleep, food, movement): ___\n• I can ask for help when I need it: ___\n• I can tolerate uncertainty: ___\n• I have a sense of purpose or values: ___\n\nTotal: ___/50\n\n35+ = Strong foundation\n25-34 = Room to grow (that's what this program is for)\nBelow 25 = Consider working with a therapist on these areas\n\nCircle your two lowest scores — these are your resilience growth edges.",
            type: "checkin",
            duration: "10 min",
          },
          {
            title: "Growth Narrative",
            description:
              "Write about a past challenge you overcame. Include:\n\n1. What happened? (brief summary)\n2. How did you feel at the time?\n3. What helped you get through it?\n4. What did you learn about yourself?\n5. How are you different (or stronger) because of it?\n6. What advice would you give someone going through something similar?\n\nThis exercise, called 'narrative exposure,' has been shown to:\n• Reduce the emotional charge of past events\n• Increase sense of personal strength\n• Help identify your existing coping resources\n• Build confidence in your ability to handle future challenges\n\nYou don't need to write about a traumatic event — any meaningful challenge works. The goal is to recognize that you already have resilience skills. This program is helping you use them more deliberately.",
            type: "reflection",
            duration: "20 min",
          },
          {
            title: "Your Resilience Action Plan",
            description:
              "Based on everything you've learned, create your personal resilience maintenance plan:\n\nDaily practices:\n□ Morning intention-setting (1 min)\n□ Stress management technique: ___\n□ Mood check-in: ___\n□ Gratitude practice: ___\n□ Physical movement: ___\n□ Connection with someone: ___\n\nWeekly practices:\n□ Review and plan the week ahead\n□ One Q2 activity from your Eisenhower Matrix\n□ Time in nature or doing something purely enjoyable\n□ Reflection/journaling\n\nWhen facing adversity:\n□ Pause and breathe (physiological sigh)\n□ Name the emotion\n□ Talk to someone you trust\n□ Ask: What can I control here?\n□ Remember: This is temporary\n□ Use your growth narrative as evidence of your strength\n\nIf struggling for more than 2 weeks: Reach out to a therapist or counselor.\n\nYou have the tools. Trust yourself to use them.",
            type: "exercise",
            duration: "15 min",
          },
        ],
      },
    ],
  },
]

export const getPrograms = async (req, res) => {
  try {
    const { category } = req.query
    const filter = {}
    if (category) filter.category = category

    const programs = await Program.find(filter).sort({ createdAt: 1 })
    const progress = await UserProgress.find({ user: req.user.id })

    const progressMap = new Map()
    for (const p of progress) {
      progressMap.set(p.program.toString(), p)
    }

    const result = programs.map((prog) => {
      const p = progressMap.get(prog._id.toString())
      const totalActivities = prog.weeks.reduce(
        (sum, w) => sum + w.activities.length,
        0,
      )
      const completedCount = p ? p.completedActivities.length : 0

      return {
        _id: prog._id,
        title: prog.title,
        description: prog.description,
        category: prog.category,
        duration: prog.duration,
        totalWeeks: prog.weeks.length,
        totalActivities,
        progress: p
          ? {
              currentWeek: p.currentWeek,
              currentActivity: p.currentActivity,
              completedCount,
              totalActivities,
              percentage:
                totalActivities > 0
                  ? Math.round((completedCount / totalActivities) * 100)
                  : 0,
              completed: p.completedWeeks.length === prog.weeks.length,
              startedAt: p.startedAt,
              lastActivityAt: p.lastActivityAt,
            }
          : null,
      }
    })

    res.status(200).json({ programs: result })
  } catch (error) {
      throw error
    }
}

export const getProgram = async (req, res) => {
  try {
    const program = await Program.findById(req.params.id)
    if (!program) {
      return res
        .status(404)
        .json({ error: { message: "Program not found" } })
    }

    const progress = await UserProgress.findOne({
      user: req.user.id,
      program: program._id,
    })

    res.status(200).json({ program, progress })
  } catch (error) {
      throw error
    }
}

export const startProgram = async (req, res) => {
  try {
    const program = await Program.findById(req.params.id)
    if (!program) {
      return res
        .status(404)
        .json({ error: { message: "Program not found" } })
    }

    const existing = await UserProgress.findOne({
      user: req.user.id,
      program: program._id,
    })

    if (existing) {
      return res.status(200).json({ progress: existing })
    }

    const progress = new UserProgress({
      user: req.user.id,
      program: program._id,
      currentWeek: 0,
      currentActivity: 0,
    })
    await progress.save()

    res.status(201).json({ progress })
  } catch (error) {
      throw error
    }
}

export const completeActivity = async (req, res) => {
  try {
    const { weekIndex, activityIndex } = req.body
    if (weekIndex === undefined || activityIndex === undefined) {
      return res.status(400).json({
        error: { message: "weekIndex and activityIndex are required" },
      })
    }

    const program = await Program.findById(req.params.id)
    if (!program) {
      return res
        .status(404)
        .json({ error: { message: "Program not found" } })
    }

    if (
      weekIndex < 0 ||
      weekIndex >= program.weeks.length ||
      activityIndex < 0 ||
      activityIndex >= program.weeks[weekIndex].activities.length
    ) {
      return res.status(400).json({
        error: { message: "Invalid week or activity index" },
      })
    }

    let progress = await UserProgress.findOne({
      user: req.user.id,
      program: program._id,
    })

    if (!progress) {
      progress = new UserProgress({
        user: req.user.id,
        program: program._id,
      })
    }

    const alreadyCompleted = progress.completedActivities.some(
      (a) => a.weekIndex === weekIndex && a.activityIndex === activityIndex,
    )

    if (!alreadyCompleted) {
      progress.completedActivities.push({ weekIndex, activityIndex })
    }

    progress.lastActivityAt = new Date()

    const weekActivityCount = program.weeks[weekIndex].activities.length
    const completedInWeek = progress.completedActivities.filter(
      (a) => a.weekIndex === weekIndex,
    ).length

    let weekCompleted = false
    let pointsEarned = 0

    if (
      completedInWeek >= weekActivityCount &&
      !progress.completedWeeks.includes(weekIndex)
    ) {
      progress.completedWeeks.push(weekIndex)
      weekCompleted = true
      pointsEarned = 5
      await awardMessagePoints(req.user.id, pointsEarned)
    }

    const nextActivityIndex = activityIndex + 1
    const nextWeekIndex = weekIndex + 1

    if (nextActivityIndex < program.weeks[weekIndex].activities.length) {
      progress.currentWeek = weekIndex
      progress.currentActivity = nextActivityIndex
    } else if (nextWeekIndex < program.weeks.length) {
      progress.currentWeek = nextWeekIndex
      progress.currentActivity = 0
    }

    await progress.save()

    const totalActivities = program.weeks.reduce(
      (sum, w) => sum + w.activities.length,
      0,
    )

    res.status(200).json({
      progress: {
        currentWeek: progress.currentWeek,
        currentActivity: progress.currentActivity,
        completedWeeks: progress.completedWeeks,
        completedActivities: progress.completedActivities,
        lastActivityAt: progress.lastActivityAt,
      },
      weekCompleted,
      pointsEarned,
      completedCount: progress.completedActivities.length,
      totalActivities,
      percentage:
        totalActivities > 0
          ? Math.round(
              (progress.completedActivities.length / totalActivities) * 100,
            )
          : 0,
    })
  } catch (error) {
    logger.error({ err: error }, "failed to complete activity")
    res
      .status(500)
      .json({ error: { message: "Failed to record activity completion" } })
  }
}

export const getMyPrograms = async (req, res) => {
  try {
    const progresses = await UserProgress.find({ user: req.user.id })
      .populate("program")
      .sort({ lastActivityAt: -1 })

    const result = progresses.map((p) => {
      const prog = p.program
      const totalActivities = prog.weeks.reduce(
        (sum, w) => sum + w.activities.length,
        0,
      )
      const completedCount = p.completedActivities.length
      const isCompleted = p.completedWeeks.length === prog.weeks.length

      return {
        _id: prog._id,
        title: prog.title,
        description: prog.description,
        category: prog.category,
        duration: prog.duration,
        totalWeeks: prog.weeks.length,
        totalActivities,
        progress: {
          currentWeek: p.currentWeek,
          currentActivity: p.currentActivity,
          completedCount,
          totalActivities,
          percentage:
            totalActivities > 0
              ? Math.round((completedCount / totalActivities) * 100)
              : 0,
          completed: isCompleted,
          startedAt: p.startedAt,
          lastActivityAt: p.lastActivityAt,
        },
      }
    })

    const inProgress = result.filter((r) => !r.progress.completed)
    const completed = result.filter((r) => r.progress.completed)

    res.status(200).json({ inProgress, completed })
  } catch (error) {
      throw error
    }
}

export const seedPrograms = async () => {
  try {
    const count = await Program.countDocuments()
    if (count === 0) {
      await Program.insertMany(SEED_PROGRAMS)
      logger.info("Seeded 3 programs")
    }
  } catch (error) {
    logger.error({ err: error }, "failed to seed programs")
  }
}

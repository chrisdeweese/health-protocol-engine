# Library Expansion Sources

This ledger tracks the source families used to expand the intervention library. It is intentionally concise: batch-level provenance lives here, while unit-level evidence text and citations live in `data/units/catalog.json`.

Use this file to answer three contributor questions:

```text
Which source families shaped a batch?
Which clinical or wellness domain was modeled?
Which items require conservative evidence grades or clinician review?
```

## Source Rules

- Prefer guideline, public-health, professional-society, and major evidence-review sources.
- Keep prescription drugs, vaccines, procedures, devices, and advanced therapies clinician-gated.
- Encode screening, triage, monitoring, and escalation separately from treatment.
- Reuse canonical units when protocols share the same action; collisions are expected.
- Grade evidence conservatively when data are observational, indirect, early, or mixed.

## Batch Ledger

| Batch | Domain | Source Families |
|---|---|---|
| 001 | Foundational lifestyle and prevention | CDC physical activity/alcohol/sun/oral guidance; AHA Life's Essential 8; NIH ODS; NCCIH; ACP CBT-I. |
| 002 | Preventive screening, measurement, immunization | USPSTF/CDC screening guidance; CDC adult immunization schedule; NIH/MedlinePlus/Kidney Foundation lab explainers. |
| 003 | Supplements and nutraceutical adjuncts | NIH ODS; NCCIH; human supplement, sports-nutrition, and nutraceutical trials/reviews. |
| 004 | Exercise, mobility, recovery, breath, stress, sleep hygiene | CDC/HHS/ACSM activity guidance; NCCIH mind-body resources; NHLBI sleep guidance; recovery-modality reviews. |
| 005 | Nutrition quality, cardiometabolic swaps, meal timing, microbiome foods | AHA, Dietary Guidelines/MyPlate, WHO nutrition guidance, PREDIMED/DASH evidence, food-specific trials. |
| 006 | Environmental prevention, indoor air, water/toxin safety, hearing, skin, oral care | EPA/CDC/NIOSH/FDA/AAD/ACS/ADA/NIDCR prevention resources. |
| 007 | Clinician-managed cardiometabolic, tobacco, sleep-apnea, bone therapies | USPSTF/ACC/AHA/ADA/AASM/CDC/FDA/Endocrine Society guidance. |
| 008 | Behavioral health, crisis safety, addiction medicine | USPSTF, VA/DoD, NICE, SAMHSA, CDC overdose, and FDA naloxone resources. |
| 009 | Musculoskeletal pain, osteoarthritis, falls, migraine | ACP/APTA/JOSPT/ACR/CDC/AHS/AAN guidance and patient resources. |
| 010 | Gastrointestinal, liver, malabsorption, microbiome-specialty care | ACG/AGA/AASLD/CDC and IBD/microbiota therapy guidance. |
| 011 | Renal, urologic, pelvic, sexual health, menopause | KDIGO, AUA/SUFU, NAMS, ACOG, ASRM, and related specialty guidance. |
| 012 | Respiratory, allergy, asthma, COPD, sinus, anaphylaxis | GINA, GOLD, ATS, AAAAI/ACAAI, ACAAI, and AAO-HNS resources. |
| 013 | Dermatology, wound care, skin infection, diabetic foot | AAD, National Psoriasis Foundation, IDSA, CDC, IWGDF, and wound-care guidance. |
| 014 | Eye, retina, glaucoma, dry eye, cataract, low vision | NEI, AAO, ASRS, LiGHT/AREDS2 evidence, CDC contact-lens resources. |
| 015 | Neurology, cognitive aging, stroke, Parkinson's, seizure, concussion | WHO, AAN, NICE, Alzheimer's Association, AHA/ASA, CDC, Parkinson's Foundation. |
| 016 | Oncology prevention, treatment toxicity, survivorship | ACS, CDC, USPSTF, ASCO, NCI, MASCC/ISOO, and survivorship/rehab resources. |
| 017 | Infectious disease, sexual health, immunization, travel, TB | CDC HIV/STI/immunization/Yellow Book/TB/respiratory-virus guidance. |
| 018 | Preconception, pregnancy, postpartum, lactation | CDC, ACOG, SMFM, USPSTF, FDA/EPA, NIH ODS, and perinatal mental-health resources. |
| 019 | Endocrine, thyroid, adrenal, PCOS, infertility | ATA, Endocrine Society, international PCOS guideline, ACOG, ASRM, AUA/ASRM. |
| 020 | Geriatric frailty, medication safety, mobility, nutrition, care planning | AGS Beers, CDC STEADI, NIA, WHO, AHRQ, dementia and palliative-care resources. |
| 021 | Oral, periodontal, caries, dental pain, dentures, head/neck cancer | CDC, ADA, NIDCR, oral-cancer, dental-pain, antibiotic-stewardship, and denture resources. |
| 022 | Sleep disorders, circadian timing, shift work, RLS, parasomnia safety | NHLBI, AASM, RLS, circadian, parasomnia, and sleep-safety resources. |
| 023 | Hydration, thermoregulation, heat/cold safety, breath autonomic training | CDC/NIOSH/OSHA/FEMA/Red Cross/NCCIH/American Lung Association resources. |
| 024 | Social connection, purpose, bereavement, caregiver support | WHO, CDC, NIA, VA, bereavement, caregiver, volunteering, and social-isolation resources. |
| 025 | Hearing, tinnitus, ear safety, vestibular rehabilitation | WHO, NIDCD, AAO-HNS, Cochrane vestibular rehab, Meniere, and vestibular migraine resources. |
| 026 | Occupational ergonomics, fatigue, psychosocial risk, work capacity | OSHA, NIOSH, ACGIH, HSE, CDC/NIOSH fatigue and psychosocial-risk materials. |
| 027 | Home/community injury, transportation, water/fire/burn/poisoning/firearm safety | CDC, NHTSA, Red Cross, FEMA, CPSC, poison-control, and firearm-storage resources. |
| 028 | Domestic food safety, high-risk foods, norovirus, cold chain, allergy, celiac labels | CDC, FDA, USDA, NIAID, and gluten-free/allergen-labeling resources. |
| 029 | Pediatric and adolescent prevention, development, oral/mental/sexual health, school/sports safety | AAP Bright Futures, CDC, USPSTF, ADA, school connectedness, and HEADS UP resources. |
| 030 | Diabetes prevention, self-management, technology, safety, complications | ADA 2026 standards, CDC DSMES/NDPP, device safety, hypoglycemia, foot/eye/kidney guidance. |
| 031 | Cardiovascular disease management, HF, AF, CAD, rehab, valves | AHA/ACC/HFSA, CDC cardiac rehab, valvular, AF, and warning-sign resources. |
| 032 | Rheumatology, autoimmune disease, gout, spondyloarthritis, lupus, immunosuppression | ACR/EULAR specialty guidance, vaccination/screening, and immunosuppression safety resources. |
| 033 | Hematology, anemia, VTE, anticoagulation, transfusion, ITP, sickle cell | ASH, CDC/NHLBI, transfusion, anticoagulation, and sickle-cell resources. |
| 034 | Vascular medicine, PAD, aortic disease, carotid stenosis, venous disease, lymphedema | ACC/AHA/SVS/USPSTF/AHA vascular and lymphedema resources. |
| 035 | Advanced cardiometabolic risk, dyslipidemia, CKM staging, obesity escalation, MASLD fibrosis | ACC/AHA, AHA PREVENT/CKM, obesity pharmacotherapy, bariatric, and MASLD fibrosis guidance. |
| 036 | Eating disorders, ARFID, binge eating, bulimia, anorexia, RED-S, weight-care safety | NICE, APA, AAP, IOC/RED-S, eating-disorder medical-risk and bone-health resources. |
| 037 | ADHD, OCD/BDD, bipolar disorder, psychosis, schizophrenia, serious mental illness recovery | NICE/APA/CANMAT/AACAP and recovery, metabolic-monitoring, and crisis resources. |
| 038 | Autism, intellectual/developmental disability, communication access, adjustments | NICE, CDC, NICHD, IDEA, AAC, occupational/speech therapy, and reasonable-adjustment resources. |
| 039 | Hair loss, alopecia, scalp inflammation, hair-restoration safety | AAD, Cochrane, scarring/traction alopecia, CCCA, PRP, transplant, and hair-device resources. |
| 040 | Contraception, emergency contraception, LARC, reproductive autonomy | CDC SPR/MEC, ACOG, FDA birth-control, emergency contraception, and LARC resources. |
| 041 | Immunization operations, catch-up, pregnancy, high-risk, occupational, travel, outbreak planning | CDC/ACIP schedules, VIS/documentation, catch-up, high-risk, occupational, travel, and outbreak resources. |
| 042 | Perioperative optimization, prehabilitation, surgical safety, ERAS, older-adult surgery | ACS/ASA/CDC/WHO/ERAS/AGS perioperative and surgical-safety resources. |
| 043 | Gynecologic health, AUB, endometriosis, fibroids, vaginitis, cervical abnormality follow-up | ACOG, NICE, CDC STI/vaginitis, ASCCP, and gynecologic procedure resources. |
| 044 | Hepatology, cirrhosis, viral hepatitis, cholestatic disease, gallstones, pancreatitis | AASLD, EASL, CDC, ACG/AGA, gallstone, pancreatitis, and hepatology surveillance resources. |

## Contributor Checklist

When adding a batch:

```text
Add or update the batch row above.
Put unit-specific citations in data/units/catalog.json.
Keep pharmaceutical and advanced-therapy units clinician-gated.
Reuse existing units before adding near-duplicates.
Add tests for meaningful conditions, collisions, and review flags.
Run npm run verify.
```

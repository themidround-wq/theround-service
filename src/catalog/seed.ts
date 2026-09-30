/** 8 categories x 3 topics, matching the wheel ("24 reviewed topics"). */
export const SEED: Record<string, Record<string, string[]>> = {
  'Antenatal Care': {
    'Booking visit': [
      'What would you cover at a woman’s antenatal booking appointment?',
    ],
    'Routine screening': [
      'Explain the routine screening tests offered during pregnancy.',
    ],
    'Reduced fetal movements': [
      'A woman at 34 weeks reports reduced fetal movements. How do you respond?',
    ],
  },
  'Labour & Delivery': {
    'Postpartum haemorrhage': [
      'How would you recognise and manage a postpartum haemorrhage?',
    ],
    'Stages of labour': [
      'Describe the stages of labour and your role in each.',
    ],
    'Shoulder dystocia': ['How would you manage a shoulder dystocia?'],
  },
  'Postnatal Care': {
    'Postnatal checks': [
      'What does a routine postnatal check for the mother involve?',
    ],
    'Infant feeding support': [
      'How would you support a woman who is struggling to breastfeed?',
    ],
    'Perinatal mental health': [
      'How would you screen for and respond to postnatal depression?',
    ],
  },
  'Newborn Care': {
    'Immediate assessment': [
      'Describe your structured assessment of a newborn immediately after birth.',
    ],
    'Neonatal jaundice': [
      'How would you assess and escalate neonatal jaundice?',
    ],
    Thermoregulation: [
      'Why is thermoregulation important in the newborn and how do you maintain it?',
    ],
  },
  'High-Risk Pregnancy': {
    'Pre-eclampsia': ['How would you recognise and manage pre-eclampsia?'],
    'Gestational diabetes': [
      'How would you counsel a woman newly diagnosed with gestational diabetes?',
    ],
    'Preterm labour': [
      'A woman presents at 30 weeks with suspected preterm labour. What do you do?',
    ],
  },
  'Family Planning': {
    'Postpartum contraception': [
      'How would you counsel someone about postpartum contraception choices?',
    ],
    'Emergency contraception': [
      'What options for emergency contraception would you discuss?',
    ],
    'Preconception advice': [
      'What preconception advice would you give a woman planning a pregnancy?',
    ],
  },
  'Clinical Ethics': {
    'Informed consent': [
      'How would you ensure consent is informed and freely given during labour?',
    ],
    Confidentiality: [
      'When, if ever, can you breach a woman’s confidentiality?',
    ],
    'Declining care': [
      'A woman declines a recommended intervention. How do you proceed?',
    ],
  },
  'Public Health': {
    'Health inequalities': [
      'How can health inequalities affect maternity outcomes and your care?',
    ],
    Safeguarding: [
      'What would prompt you to raise a safeguarding concern in maternity care?',
    ],
    'Smoking cessation': [
      'How would you support a pregnant woman who smokes to stop?',
    ],
  },
};

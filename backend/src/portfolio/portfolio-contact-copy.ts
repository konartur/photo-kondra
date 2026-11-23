import type { PortfolioSettings } from '@prisma/client';

type StoredContactCopy = Pick<PortfolioSettings,
  'contactTitleUk' | 'contactTitleEn' | 'contactDescriptionUk' | 'contactDescriptionEn'
  | 'contactButtonLabelUk' | 'contactButtonLabelEn'>;

export function contactSectionCopy(settings: StoredContactCopy) {
  return {
    title: {
      uk: settings.contactTitleUk.trim() || 'Найважливіше варто зберегти.',
      en: settings.contactTitleEn.trim() || 'The most important moments are worth keeping.',
    },
    description: {
      uk: settings.contactDescriptionUk.trim() || 'Давайте створимо фотографії, до яких захочеться повертатися знову і знову.',
      en: settings.contactDescriptionEn.trim() || 'Let us make photographs you will want to revisit again and again.',
    },
    buttonLabel: {
      uk: settings.contactButtonLabelUk.trim() || 'Забронювати фотосесію',
      en: settings.contactButtonLabelEn.trim() || 'Book a photo session',
    },
  };
}

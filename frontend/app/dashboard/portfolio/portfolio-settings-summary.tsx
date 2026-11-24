import type { PortfolioHomeDraftInputDto } from '@/lib/portfolio/contracts';

export function SettingsPublicationSummary({ draft }: { draft: PortfolioHomeDraftInputDto }) {
  const text = (value: { uk: string; en: string }) => (
    <>
      <p>Українська: {value.uk || 'Не заповнено'}</p>
      <p>English: {value.en || 'Не заповнено'}</p>
    </>
  );
  return (
    <details className="rounded-lg border border-zinc-200 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        Перевірити всю спільну публікацію
      </summary>
      <p className="text-sm text-zinc-700">
        Після публікації оновляться всі перелічені секції головної та контакти. Нижче — поточна
        чернетка обох розділів.
      </p>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-semibold">Головні фото</dt>
          <dd>
            Широке: {draft.hero.desktop ? 'обрано' : 'немає'} · Мобільне:{' '}
            {draft.hero.mobile ? 'обрано' : 'немає'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Фотосесії · {draft.servicesSection.serviceIds.length}</dt>
          <dd>
            {text(draft.servicesSection.title)}
            {text(draft.servicesSection.description)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Добірка історій · {draft.storiesSection.items.length}</dt>
          <dd>{text(draft.storiesSection.title)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Вступ запису</dt>
          <dd>{text(draft.bookingIntro)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Контакти</dt>
          <dd>
            <ul>
              {draft.contacts.map((contact) => (
                <li key={contact.type}>
                  {contact.type}: {contact.address || 'Не заповнено'} ·{' '}
                  {contact.visible ? 'видимий' : 'прихований'}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Оформлення запису</dt>
          <dd>
            {text(draft.contactSection.title)}
            {text(draft.contactSection.description)}Фонове фото:{' '}
            {draft.contactSection.background ? 'обрано' : 'немає'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Google та соцмережі</dt>
          <dd>
            {text(draft.seo.title)}
            {text(draft.seo.description)}
          </dd>
        </div>
      </dl>
    </details>
  );
}

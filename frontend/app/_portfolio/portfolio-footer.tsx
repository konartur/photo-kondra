import { portfolioBrand } from './portfolio-brand';
import styles from './portfolio.module.css';
import type { PortfolioSiteDto } from '@/lib/portfolio/contracts';

export function PortfolioFooter({ site }: { site?: PortfolioSiteDto }) {
  const brand = site?.brand ?? portfolioBrand;
  return (
    <footer className={styles.footer} id="contacts" tabIndex={-1}>
      <div className={styles.footerRow}>
        <div className={styles.brand}>{brand}<span>PHOTOGRAPHY</span></div>
        <div className={styles.footerContacts}>
          {site ? site.contacts.map(contact => <a key={contact.type} href={contact.href}>{contact.label} ↗</a>)
            : <><span>EMAIL ↗</span><span>INSTAGRAM ↗</span><span>TELEGRAM ↗</span></>}
        </div>
      </div>
      <div className={styles.footerDivider} />
      <div className={styles.footerRow}>
        <p>© {new Date().getUTCFullYear()} {brand}{site ? '' : ' · КОНЦЕПТ ДИЗАЙНУ'}</p>
        {!site && <p>ДЕМО-ФОТО / ДЕМО-КОНТАКТИ · ПОТРІБНА ЗАМІНА</p>}
      </div>
    </footer>
  );
}

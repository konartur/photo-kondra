import { portfolioBrand } from './portfolio-brand';
import styles from './portfolio.module.css';

export function PortfolioFooter() {
  return (
    <footer className={styles.footer} id="contacts" tabIndex={-1}>
      <div className={styles.footerRow}>
        <div className={styles.brand}>{portfolioBrand}<span>PHOTOGRAPHY</span></div>
        <div className={styles.footerContacts}><span>EMAIL ↗</span><span>INSTAGRAM ↗</span><span>TELEGRAM ↗</span></div>
      </div>
      <div className={styles.footerDivider} />
      <div className={styles.footerRow}>
        <p>© {new Date().getUTCFullYear()} {portfolioBrand} · КОНЦЕПТ ДИЗАЙНУ</p>
        <p>ДЕМО-ФОТО / ДЕМО-КОНТАКТИ · ПОТРІБНА ЗАМІНА</p>
      </div>
    </footer>
  );
}

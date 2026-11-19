type StoryPhoto = { photo: string; alt: string };

type PortfolioStory = {
  slug: string;
  title: string;
  subtitle: string;
  photos: [StoryPhoto, StoryPhoto, StoryPhoto, ...StoryPhoto[]];
};

export const portfolioPrice = '3 000 грн / 1 год';

export const portfolioStories: PortfolioStory[] = [
  {
    slug: 'love', title: 'Love Story', subtitle: 'Щирість у кожному погляді',
    photos: [
      { photo: '1529636798458-92182e662485', alt: 'Квітковий букет у руках' },
      { photo: '1519741497674-611481863552', alt: 'Пара під час урочистої миті' },
      { photo: '1523438885200-e635ba2c371e', alt: 'Альтанка з квітковими композиціями' },
      { photo: '1537633552985-df8429e8048b', alt: 'Емоційний момент пари' },
    ],
  },
  {
    slug: 'portrait', title: 'Portrait', subtitle: 'Бути собою — найкраща історія',
    photos: [
      { photo: '1534528741775-53994a69daeb', alt: 'Жіночий портрет із синім та фіолетовим освітленням' },
      { photo: '1524504388940-b1c1722653e1', alt: 'Жіночий портрет у м’якому світлі' },
      { photo: '1544005313-94ddf0286df2', alt: 'Крупний план жіночого портрета' },
      { photo: '1506794778202-cad84cf45f1d', alt: 'Портрет чоловіка' },
    ],
  },
  {
    slug: 'family', title: 'Family', subtitle: 'Тепло, яке завжди поруч',
    photos: [
      { photo: '1511895426328-dc8714191300', alt: 'Родина проводить час разом на природі' },
      { photo: '1592711491694-e85f60a7773a', alt: 'Родина гуляє залитим сонцем лугом' },
      { photo: '1503454537195-1dcabb73ffb9', alt: 'Дитина на прогулянці' },
    ],
  },
  {
    slug: 'events', title: 'Events / Lifestyle', subtitle: 'Живі моменти вашого дня',
    photos: [
      { photo: '1492684223066-81342ee5ff30', alt: 'Вогні та публіка на концерті' },
      { photo: '1511795409834-ef04bbd61622', alt: 'Атмосфера святкової події' },
      { photo: '1506157786151-b8491531f063', alt: 'Музичний виступ на сцені' },
    ],
  },
  {
    slug: 'brand', title: 'Brand / Commercial', subtitle: 'Історії вашого бренду',
    photos: [
      { photo: '1490481651871-ab68de25d43d', alt: 'Одяг та образ для брендової зйомки' },
      { photo: '1483985988355-763728e1935b', alt: 'Мода та деталі образу' },
      { photo: '1441986300917-64674bd600d8', alt: 'Інтер’єр магазину одягу' },
    ],
  },
  {
    slug: 'pets', title: 'Фотосесія з улюбленцем', subtitle: 'Теплі моменти з тим, хто завжди поруч',
    photos: [
      { photo: '1662987610442-2f9c4a90a6dd', alt: 'Людина обіймає собаку в траві у вечірньому світлі' },
      { photo: '1667386447971-398b6527a393', alt: 'Людина з собакою серед польових квітів' },
      { photo: '1667386440443-cb2dcb02c882', alt: 'Жінка обіймає собаку біля дерев’яної стіни' },
      { photo: '1540869438371-f8aad4b6a0d7', alt: 'Чоловік із собакою в осінньому лісі' },
    ],
  },
];

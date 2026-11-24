interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  keywords: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? '' : baseUrl;
};

const data: ISiteMetadataResult = {
  siteTitle: 'danran workouts',
  siteUrl: 'https://workouts.danran.one',
  logo: '/images/logo.svg',
  description: 'CrossFit、Hyrox、力量与户外训练数据看板',
  keywords: 'workouts, crossfit, hyrox, badminton, swimming, running, hiking',
  navLinks: [
    {
      name: '汇总',
      url: `${getBasePath()}/summary`,
    },
    // {
    //   name: 'Blog',
    //   url: 'https://github.com/CoolDarran',
    // },
    // {
    //   name: 'About',
    //   url: 'https://github.com/CoolDarran/running_page/blob/master/README-CN.md',
    // },
  ],
};

export default data;

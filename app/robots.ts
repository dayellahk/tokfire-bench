import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/signin','/native-connect','/signin-with-chatgpt','/zh-Hant/signin','/zh-Hans/signin','/zh-Hant/native-connect','/zh-Hans/native-connect']},sitemap:'https://tokfires.com/sitemap.xml',host:'https://tokfires.com'};}

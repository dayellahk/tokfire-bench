import {notFound} from 'next/navigation';
import Home from '../../page';
import SignIn from '../../signin/page';
import Methodology from '../../methodology/page';
import NativeConnect from '../../native-connect/page';
export default async function LocalizedPage({params}:{params:Promise<{locale:string;path?:string[]}>}){const {locale,path=[]}=await params;if(locale!=='zh-Hant'&&locale!=='zh-Hans')notFound();const page=path.join('/');switch(page){case '':return <Home/>;case 'signin':return <SignIn/>;case 'methodology':return <Methodology/>;case 'native-connect':return <NativeConnect params={Promise.resolve({locale})}/>;default:notFound();}}

import {notFound} from 'next/navigation';
import {BlogArticle} from '@/components/blog';
import {getPost} from '@/lib/blog';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const post=getPost(slug);if(!post)notFound();return <BlogArticle post={post}/>;}

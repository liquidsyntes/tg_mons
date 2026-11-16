import {NextRequest,NextResponse} from 'next/server';
import {verifyBearerToken} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
export async function GET(request:NextRequest):Promise<NextResponse> {
  const auth=await verifyBearerToken(request);if(!auth.authorized)return auth.response;
  if(auth.userId===null)return NextResponse.json({error:'Требуется пользовательская учётная запись'},{status:403});
  const page=Number(request.nextUrl.searchParams.get('page')??0),q=request.nextUrl.searchParams.get('q')?.trim()??'';
  if(!Number.isSafeInteger(page)||page<0||page>10000||q.length>200)return NextResponse.json({error:'Некорректные параметры'},{status:400});
  try {
    const channel=await prisma.userChannel.findFirst({where:{userId:auth.userId,isMine:true,isActive:true,channel:{isActive:true}},select:{channelId:true}});
    if(!channel)return NextResponse.json({posts:[],hasMore:false,noMyChannel:true});
    const posts=await prisma.post.findMany({where:{channelId:channel.channelId,deletedAt:null,...(q?{text:{contains:q,mode:'insensitive' as const}}:{})},orderBy:[{publishedAt:'desc'},{id:'desc'}],skip:page*20,take:21,select:{id:true,publishedAt:true,text:true}});
    return NextResponse.json({posts:posts.slice(0,20).map(p=>({...p,text:p.text?.slice(0,180)??null})),hasMore:posts.length>20,noMyChannel:false});
  }catch{return NextResponse.json({error:'Не удалось загрузить публикации'},{status:503});}
}
